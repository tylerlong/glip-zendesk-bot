const dotenv = require('dotenv')
const axios = require('axios')
const striptags = require('striptags')

dotenv.config()

const botId = parseInt(process.env.GLIP_USER_ID)
let userId
let groupId

const GlipSocket = require('glip.socket.io')
const client = new GlipSocket({
  host: process.env.GLIP_HOST || 'app.glip.com',
  port: process.env.GLIP_PORT || 443,
  user: process.env.GLIP_EMAIL,
  password: process.env.GLIP_PASSWORD
})

const postWelcomeMessage = () => {
  axios.request({
    url: `https://glip.zendesk.com/api/v2/help_center/en-us/articles/${process.env.ZENDESK_ARTICLE_ID}.json`,
    method: 'get',
    auth: {
      username: process.env.ZENDESK_USERNAME,
      password: process.env.ZENDESK_PASSWORD
    }
  }).then(r => {
    client.post(groupId, striptags(r.data.article.body))
  })
}

const likeUserPost = (postId, postText) => {
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
      console.warn(error)
      console.log(JSON.stringify(data, null, 2))
      client.post(groupId, ':smiley:')
    }
  )
}

const createSampleTask = () => {
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
      console.warn(error)
      console.log(JSON.stringify(data, null, 2))
      client.post(groupId, 'I created a sample task for you, please tick the checkbox to mark it as complete')
    }
  )
}

let waitingForFirstPost = false
let waitingForCompleteTask = false
let finishedFirstTimeWizard = false
const firstTimeLicenser = (type, data) => {
  if (type === 2 && data.members.length === 2) { // first time add the bot
    userId = data.members.filter(m => m !== botId)[0]
    groupId = data._id
    postWelcomeMessage()
    setTimeout(() => {
      client.post(groupId, 'Please post something!')
      waitingForFirstPost = true
    }, 5000)
  }
  if (waitingForFirstPost && type === 4 && data.creator_id !== botId) {
    waitingForFirstPost = false
    const postId = data._id
    const postText = data.text
    likeUserPost(postId, postText)
    setTimeout(() => {
      createSampleTask()
      waitingForCompleteTask = true
    }, 5000)
  }
  if (waitingForCompleteTask && type === 4 && data.text === '' && data.activity_data && data.activity_data.value === 1) {
    client.post(groupId, 'Well done!')
    waitingForCompleteTask = false
    setTimeout(() => {
      client.post(groupId, 'You can upload files/images, like this:')
      client.post_file_from_url(groupId, process.env.SAMPLE_FILE_URL, 'Hey, look at this cool icon!')
      client.removeListener('message', firstTimeLicenser)
      finishedFirstTimeWizard = true
    }, 5000)
  }
}

client.on('message', firstTimeLicenser)

// Microsoft QnA Maker
client.on('message', (type, data) => {
  if (finishedFirstTimeWizard && type === 4 && data.text.trim() !== '' && data.text.trim().endsWith('?')) {
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
      if (r.data.answers && r.data.answers.length > 0 && r.data.answers[0].score > 50) {
        const answer = r.data.answers[0]
        client.post(groupId, `I find the following article from my knowledge base:
Title: ${answer.questions[0]}
Body: ${answer.answer}`)
      } else {
        client.post(groupId, 'I am sorry but this question is not in my knowledge base')
      }
    })
  }
})

client.start()
