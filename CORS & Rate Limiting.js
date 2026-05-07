const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet()); // Security headers
app.use(cors({ origin: process.env.CORS_ORIGIN }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);