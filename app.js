const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dataBasePath = path.join(__dirname, "twitterClone.db");

let dataBase = null;

const initializeDBAndServer = async () => {
  try {
    dataBase = await open({
      filename: dataBasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server started running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.get("/users/", async (request, response) => {
  const getUsersQuery = `
        SELECT
            *
        FROM
            user;`;
  const usersArray = await dataBase.all(getUsersQuery);
  response.send(usersArray);
});

app.delete("/users/:userId/", async (request, response) => {
  const { userId } = request.params;
  const deleteUserQuery = `
        DELETE FROM
            user
        WHERE
            user_id = ${userId};`;
  await dataBase.run(deleteUserQuery);
  response.send("Removed User");
});

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * from user WHERE username = '${username}';`;
  const dbUser = await dataBase.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
            INSERT INTO
                user (name, username, password, gender )
            VALUES
                (
                    '${name}',
                    '${username}',
                    '${hashedPassword}',
                    '${gender}'
                );`;
      const dbResponse = await dataBase.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * from user WHERE username = '${username}';`;
  const dbUser = await dataBase.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN_FOR_PASSWORD");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(
      jwtToken,
      "SECRET_TOKEN_FOR_PASSWORD",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await dataBase.get(getUserDetails);
  let { user_id } = userDetails;

  const getUserTweetsQuery = `
        SELECT
            user.username AS username,
            tweet.tweet AS tweet,
            tweet.date_time AS dateTime
        FROM
            tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
            INNER JOIN user ON tweet.user_id = user.user_id
        WHERE 
            follower.follower_user_id = '${user_id}'
        ORDER BY 
            tweet.date_time DESC
        LIMIT 
            4;`;
  const userTweetsArray = await dataBase.all(getUserTweetsQuery);
  response.send(userTweetsArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await dataBase.get(getUserDetails);
  let { user_id } = userDetails;

  const getUserFollowsQuery = `
        SELECT
            user.name AS name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE
            follower.follower_user_id = '${user_id}';`;
  const userFollowsQuery = await dataBase.all(getUserFollowsQuery);
  response.send(userFollowsQuery);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await dataBase.get(getUserDetails);
  let { user_id } = userDetails;

  const getUserFollowerQuery = `
        SELECT
            user.name AS name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE
            follower.following_user_id = '${user_id}';`;
  const userFollowerQuery = await dataBase.all(getUserFollowerQuery);
  response.send(userFollowerQuery);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await dataBase.get(getUserDetails);
  let { user_id } = userDetails;
  const { tweetId } = request.params;

  const getTweetQuery = `
    SELECT
        tweet.tweet AS tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
    FROM
        tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
            LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
            LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE
        tweet.tweet_id = ${tweetId} AND follower.follower_user_id = '${user_id}'
    GROUP BY 
        tweet.tweet_id;`;
  const tweetQuery = await dataBase.get(getTweetQuery);
  if (tweetQuery === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweetQuery);
  }
});

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await dataBase.get(getUserDetails);
  let { user_id } = userDetails;

  const getTweetsQuery = `SELECT * FROM tweet WHERE user_id = ${user_id} ORDER BY tweet_id;`;

  const tweetObjectsList = await dataBase.all(getTweetsQuery);

  const tweetIdsList = tweetObjectsList.map((object) => {
    return object.tweet_id;
  });

  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes 
    FROM like
    WHERE tweet_id IN (${tweetIdsList}) 
    GROUP BY tweet_id
    ORDER BY tweet_id;`;

  const likesObjectsList = await dataBase.all(getLikesQuery);

  const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies 
    FROM reply
    WHERE tweet_id IN (${tweetIdsList}) 
    GROUP BY tweet_id
    ORDER BY tweet_id;`;

  const repliesObjectsList = await dataBase.all(getRepliesQuery);

  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0;
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0;

      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await dataBase.get(selectUserQuery);
    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetInfo = await dataBase.get(getTweetQuery);

    const followingUsersQuery = `
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id = ${dbUser.user_id};`;

    const followingUsersObjectsList = await dataBase.all(followingUsersQuery);

    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });

    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getLikesQuery = `
        SELECT user_id 
        FROM like
        WHERE tweet_id = ${tweet_id};`;

      const likedUserIdObjectsList = await dataBase.all(getLikesQuery);
      const likedUserIdsList = likedUserIdObjectsList.map((object) => {
        return object.user_id;
      });

      const getLikedUsersQuery = `
      SELECT username
      FROM user
      WHERE user_id IN (${likedUserIdsList});`;

      const likedUsersObjectsList = await dataBase.all(getLikedUsersQuery);

      const likedUsersList = likedUsersObjectsList.map((object) => {
        return object.username;
      });

      response.send({
        likes: likedUsersList,
      });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await dataBase.get(selectUserQuery);
    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetInfo = await dataBase.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id
    FROM follower
    WHERE follower_user_id = ${dbUser.user_id};`;

    const followingUsersObjectsList = await dataBase.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });

    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
      SELECT user.name AS name,
      reply.reply AS reply
      FROM reply
      INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ${tweet_id};`;

      const userRepliesObject = await dataBase.all(getUserRepliesQuery);
      response.send({
        replies: userRepliesObject,
      });
    }
  }
);

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;

  const dbUser = await dataBase.get(selectUserQuery);
  const { user_id } = dbUser;
  const { tweet } = request.body;
  const dateString = new Date().toISOString();
  const dateTime = dateString.slice(0, 10) + " " + dateString.slice(11, 19);
  const addNewTweetQuery = `
INSERT INTO tweet (tweet, user_id, date_time)
VALUES ('${tweet}', ${user_id}, '${dateTime}');`;

  await dataBase.run(addNewTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;

    const dbUser = await dataBase.get(selectUserQuery);
    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;

    const tweetInfo = await dataBase.get(getTweetQuery);
    if (dbUser.user_id !== tweetInfo.user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;

      await dataBase.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
