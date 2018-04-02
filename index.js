const dotenv = require('dotenv')
const axios = require('axios')
const striptags = require('striptags')
const R = require('ramda')

dotenv.config()

const db = {}

const botId = parseInt(process.env.GLIP_USER_ID)

const GlipSocket = require('glip.socket.io')
const client = new GlipSocket({
  host: process.env.GLIP_HOST || 'app.glip.com',
  port: process.env.GLIP_PORT || 443,
  user: process.env.GLIP_EMAIL,
  password: process.env.GLIP_PASSWORD
})

if (process.env.DEBUG === '1') {
  client.on('message', (type, data) => {
    console.log(type, data)
  })
}

const postWelcomeMessage = (userId) => {
  axios.request({
    url: `https://glip.zendesk.com/api/v2/help_center/en-us/articles/${process.env.ZENDESK_ARTICLE_ID}.json`,
    method: 'get',
    auth: {
      username: process.env.ZENDESK_USERNAME,
      password: process.env.ZENDESK_PASSWORD
    }
  }).then(r => {
    // client.post(db[userId].groupId, striptags(r.data.article.body))
    client.post(db[userId].groupId, 'Welcome to Glip OnBoarding Wizard!')
  })
}

const likeUserPost = (userId, postId, postText) => {
  client.request(
    `/api/post/${postId}`,
    'PUT',
    {
      'text': postText,
      '_id': postId,
      'likes': [
        botId
      ]
    },
    (error, data) => {
      if (error != null) { console.warn(error) }
      client.post(db[userId].groupId, ':smiley:')
    }
  )
}

const createSampleTask = (userId) => {
  const groupId = db[userId].groupId
  client.request(
    '/api/task',
    'POST',
    {
      'group_ids': [
        groupId
      ],
      'assigned_to_ids': [
        userId
      ],
      'text': 'A sample task for you',
      'due': null
    },
    (error, data) => {
      if (error != null) { console.warn(error) }
      client.post(groupId, 'I created a sample task for you, please tick the checkbox to mark it as complete')
    }
  )
}

const firstTimeLicenser = (type, data) => {
  if (type === 2 && data.members.length === 2) { // first time add the bot
    const userId = data.members.filter(m => m !== botId)[0]
    db[userId] = {
      groupId: data._id,
      waitingForFirstPost: false,
      waitingForCompleteTask: false,
      finishedFirstTimeWizard: false
    }
    postWelcomeMessage(userId)
    setTimeout(() => {
      client.post(db[userId].groupId, 'Please post something!')
      db[userId].waitingForFirstPost = true
    }, 5000)
  }
  if (type === 4 && db[data.creator_id] && db[data.creator_id].waitingForFirstPost) {
    const userId = data.creator_id
    db[userId].waitingForFirstPost = false
    const postId = data._id
    const postText = data.text
    likeUserPost(userId, postId, postText)
    setTimeout(() => {
      createSampleTask(userId)
      db[userId].waitingForCompleteTask = true
    }, 5000)
  }
  if (type === 4 && db[data.creator_id] && db[data.creator_id].waitingForCompleteTask && data.text === '' && data.activity_data && data.activity_data.value === 1) {
    const userId = data.creator_id
    client.post(db[userId].groupId, 'Well done!')
    db[userId].waitingForCompleteTask = false
    setTimeout(() => {
      client.post(db[userId].groupId, 'Now it\'s your turn, please create a task for me and post it to this conversation')
      db[userId].waitingForCreatingTask = true
    }, 5000)
  }
  if (type === 9 && db[data.creator_id] && db[data.creator_id].waitingForCreatingTask) {
    const taskId = data._id
    const userId = data.creator_id
    client.request(
      `/api/task/${taskId}`,
      'PUT',
      {
        complete_boolean: 1
      },
      (error, data) => {
        console.warn(error, data)
        console.log(JSON.stringify(data, null, 2))
      }
    )
    setTimeout(() => {
      client.post(db[userId].groupId, 'I\'ve seen the task you created for me and I\'ve marked it as complete!')
    }, 5000)
    setTimeout(() => {
      client.post(db[userId].groupId, 'You can upload files/images, like this:')
      client.post_file_from_url(db[userId].groupId, process.env.SAMPLE_FILE_URL, 'Hey, look at this cool icon!')

      setTimeout(() => {
        client.post(db[userId].groupId, 'Now it\'s your turn. Please upload a document to this conversation')
        db[userId].waitingForUploading = true
      }, 5000)
    }, 10000)
  }
  if (type === 4 && db[data.creator_id] && db[data.creator_id].waitingForUploading && data.item_ids.length > 0) {
    const userId = data.creator_id
    setTimeout(() => {
      client.request(
        `/api/post`,
        'POST',
        {
          text: 'This is a nice document!',
          group_id: db[userId].groupId,
          at_mention_item_ids: data.item_ids,
          parent_id: data.item_ids[0]
        },
        (error, data) => {
          console.warn(error, data)
          console.log(JSON.stringify(data, null, 2))
        }
      )

      client.removeListener('message', firstTimeLicenser)
      db[userId].finishedFirstTimeWizard = true

      setTimeout(() => {
        client.post(db[userId].groupId, 'Congratulations! You have completed the onboarding widzard!')
      }, 5000)
    }, 5000)
  }
}

client.on('message', firstTimeLicenser)

// Microsoft QnA Maker
client.on('message', (type, data) => {
  if (type !== 4) {
    return
  }
  const userId = data.creator_id
  if (db[userId] && !db[userId].finishedFirstTimeWizard) {
    return
  }
  const groupId = data.group_id
  if (data.text && data.text.trim() !== '' && data.text.trim().endsWith('?')) {
    axios.request({
      url: `https://westus.api.cognitive.microsoft.com/qnamaker/v2.0/knowledgebases/${process.env.MS_QNA_KB_ID}/generateAnswer`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': process.env.MS_QNA_SUB_KEY
      },
      data: {
        question: data.text.trim()
      }
    }).then(r => {
      if (r.data.answers && r.data.answers.length > 0 && r.data.answers[0].score > 20) {
        const answers = R.pipe(
          R.filter(a => a.score > 20),
          R.take(2),
          R.map(a => `* [${a.questions[0]}](${R.last(a.answer.split(/\s+/g))})`)
        )(r.data.answers)
        client.post(groupId, `I find the following article(s) from my knowledge base:

${answers.join('\n')}
`)
      } else {
        client.post(groupId, 'I am sorry but this question is not in my knowledge base')
      }
    })
  }
})

client.start()
