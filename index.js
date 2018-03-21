const dotenv = require('dotenv')

dotenv.config()

const botId = parseInt(process.env.GLIP_USER_ID)
let userId

const GlipSocket = require('glip.socket.io')
const client = new GlipSocket({
  host: process.env.GLIP_HOST || 'app.glip.com',
  port: process.env.GLIP_PORT || 443,
  user: process.env.GLIP_EMAIL,
  password: process.env.GLIP_PASSWORD
})
let waiting = false
let groupId
client.on('message', (type, data) => {
  if (type === 2 && data.members.length === 2) {
    userId = data.members.filter(m => m !== botId)[0]
    groupId = data._id
    console.log(`New conversation started in group ${groupId}`)
    client.post(groupId, 'Welcome to Glip!') // todo: send an article from zendesk
    setTimeout(() => {
      client.post(groupId, 'Please post something!')
      waiting = true
    }, 3000)
  }
  if (waiting && type === 4 && data.creator_id !== botId) {
    waiting = false
    const postId = data._id
    const postText = data.text
    console.log(data)
    console.log(postId)
    console.log(botId)
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
})
client.start()

// client.on('started', () => {
//   client.request(
//     '/api/task',
//     'POST',
//     {
//       'group_ids': [
//         16130957314
//       ],
//       'assigned_to_ids': [

//       ],
//       'text': 'sample task from code 5',
//       'due': null
//     },
//     (error, data) => {
//       console.warn(error)
//       console.log(JSON.stringify(data, null, 2))
//     }
//   )
// })

// const zendesk = require('node-zendesk')

// const z = zendesk.createClient({
//   username: process.env.ZENDESK_USERNAME,
//   token: process.env.ZENDESK_TOKEN,
//   remoteUri: 'https://remote.zendesk.com/api/v2'
// })

// z.users.list(function (err, req, result) {
//   if (err) {
//     console.log(err)
//     console.log(err.result)
//     return
//   }
//   console.log(JSON.stringify(result[0], null, 2, true))// gets the first page
// })
