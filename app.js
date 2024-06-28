const express = require('express')
const app = express()
const path = require('path')
const jwt = require('jsonwebtoken')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeServerAndDB = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server is up and running')
    })
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`)
    process.exit(1)
  }
}

initializeServerAndDB()

//API-1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const val = await db.get(`
  select * from user where username = '${username}';
  `)
  if (val === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedpassword = await bcrypt.hash(password, 10)
      const q = `
      insert into user(name,username,password,gender)
      values('${name}','${username}','${hashedpassword}','${gender}');
      `
      await db.run(q)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API-2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const val = await db.get(`
  select * from user where username = '${username}';
  `)
  if (val === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const ispasswordcorrect = await bcrypt.compare(password, val.password)
    if (ispasswordcorrect) {
      const db_val = await db.get(`
      select user_id from user where username = '${username}';
      `)
      const payload = {
        user_id: db_val.user_id,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.status(200)
      response.send({
        jwtToken: jwtToken,
      })
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//middleware function

const tokenverifier = (request, response, next) => {
  let jwtToken
  const obj = request.headers['authorization']
  if (obj !== undefined) {
    jwtToken = obj.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.user_id = payload.user_id
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', tokenverifier, async (request, response) => {
  const user_id = request.user_id
  const q = `
  select user.username as username,tweet.tweet as tweet,tweet.date_time as dateTime
  from follower inner join user on follower.following_user_id = user.user_id
  inner join tweet on tweet.user_id = user.user_id
  where follower.follower_user_id = ${user_id}
  order by tweet.date_time desc
  limit 4; 
  `
  const val = await db.all(q)
  response.send(val)
})

app.get('/user/following/', tokenverifier, async (request, response) => {
  const user_id = request.user_id
  const q = `
  select user.name as name from user 
  inner join follower on follower.following_user_id=user.user_id
  where follower.follower_user_id = ${user_id};
  `
  const val = await db.all(q)
  response.send(val)
})

app.get('/user/followers/', tokenverifier, async (request, response) => {
  const user_id = request.user_id
  const q = `
  select user.name as name from user 
  inner join follower on follower.follower_user_id=user.user_id
  where follower.following_user_id = ${user_id};
  `
  const val = await db.all(q)
  response.send(val)
})

//API-6
app.get('/tweets/:tweetId/', tokenverifier, async (request, response) => {
  const {tweetId} = request.params
  const user_id = request.user_id
  let q1 = `
  select user.user_id from user
  inner join follower on follower.following_user_id = user.user_id
  where follower.follower_user_id = '${user_id}';
  `
  let followinglist = await db.all(q1)
  followinglist = followinglist.map(x => x.user_id)
  //console.log(followinglist)
  let tweet_user_id = await db.get(`
  select user_id from tweet where tweet_id = ${tweetId};
  `)
  //console.log(tweet_user_id)
  if (followinglist.includes(tweet_user_id.user_id)) {
    const q = `
    select tweet.tweet as tweet, 
    (select count(*) from like where like.tweet_id = '${tweetId}') as likes,
    (select count(*) from reply where reply.tweet_id = '${tweetId}') as replies,    
    tweet.date_time as dateTime
    from tweet;
    `
    const ans = await db.get(q)
    response.send(ans)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-7

app.get('/tweets/:tweetId/likes/', tokenverifier, async (request, response) => {
  const {tweetId} = request.params
  const user_id = request.user_id
  let q1 = `
  select user.user_id from user
  inner join follower on follower.following_user_id = user.user_id
  where follower.follower_user_id = '${user_id}';
  `
  let followinglist = await db.all(q1)
  followinglist = followinglist.map(x => x.user_id)
  //console.log(followinglist)
  let tweet_user_id = await db.get(`
  select user_id from tweet where tweet_id = ${tweetId};
  `)
  //console.log(tweet_user_id)
  if (followinglist.includes(tweet_user_id.user_id)) {
    const q = `
    select user.username from user 
    inner join like on like.user_id = user.user_id
    where like.tweet_id = '${tweetId}';
    `
    let ans = await db.all(q)
    ans = ans.map(x => x.username)
    response.send({
      likes: ans,
    })
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-8
app.get(
  '/tweets/:tweetId/replies/',
  tokenverifier,
  async (request, response) => {
    const {tweetId} = request.params
    const user_id = request.user_id
    let q1 = `
  select user.user_id from user
  inner join follower on follower.following_user_id = user.user_id
  where follower.follower_user_id = '${user_id}';
  `
    let followinglist = await db.all(q1)
    followinglist = followinglist.map(x => x.user_id)
    //console.log(followinglist)
    let tweet_user_id = await db.get(`
  select user_id from tweet where tweet_id = ${tweetId};
  `)
    //console.log(tweet_user_id)
    if (followinglist.includes(tweet_user_id.user_id)) {
      const q = `
    select user.name as name,reply.reply as reply
    from user inner join reply on user.user_id = reply.user_id
    where reply.tweet_id = '${tweetId}';
    `
      let ans = await db.all(q)
      response.send({
        replies: ans,
      })
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-9

app.get('/user/tweets/', tokenverifier, async (request, response) => {
  const user_id = request.user_id
  const q = `
  select tweet,
  (select count(*) from like where like.tweet_id = tweet.tweet_id ) as likes,
  (select count(*) from reply where reply.tweet_id = tweet.tweet_id ) as replies,
  tweet.date_time as dateTime 
  from tweet where tweet.user_id='${user_id}';
  `
  let val = await db.all(q)
  response.send(val)
})

//API-10

app.post('/user/tweets/', tokenverifier, async (request, response) => {
  const user_id = request.user_id
  const tweet = request.body.tweet
  const date = new Date()
  let q = `
  insert into tweet(tweet,user_id,date_time)
  values('${tweet}','${user_id}','${date.toISOString()}');
  `
  await db.run(q)
  response.send('Created a Tweet')
})

/*
  user -> user_id,name,username,password,gender
  follower -> follower_id,follower_user_id,following_user_id
  Here, if user1 follows user2 then,
  follower_user_id is the user ID of user1 and 
  following_user_id is the user ID of user2.
  tweet -> tweet_id,tweet,user_id,date_time
  reply -> reply_id,tweet_id,reply,user_id,date_time
  like -> like_id,tweet_id,user_id,date_time
 */

//API-11
app.delete('/tweets/:tweetId/', tokenverifier, async (request, response) => {
  const {tweetId} = request.params
  const user_id = request.user_id
  let q_1 = `select tweet_id from tweet where user_id='${user_id}';`
  let lister = await db.all(q_1)
  lister = lister.map(x => x.tweet_id)
  //list.includes() comparing the datatype also
  const lispresent = lister.some(x => x == tweetId)
  if (lispresent) {
    let q = `
    delete from tweet where tweet_id = '${tweetId}';
    `
    await db.run(q)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
