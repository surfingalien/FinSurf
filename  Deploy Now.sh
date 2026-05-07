# 1. Prepare files
mkdir trading-trip-backend
cd trading-trip-backend
npm init -y
npm install express ws dotenv cors sqlite3 @simplewebauthn/server openai

# 2. Add your code files
# server.js, .env, Dockerfile, public/index.html

# 3. Start
docker-compose up -d
# or
node server.js

# 4. Visit http://localhost:3000