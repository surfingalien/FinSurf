const redis = require('redis');
const redisClient = redis.createClient();
// Use redisClient.publish() instead of direct ws.send()