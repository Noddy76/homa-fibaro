var winston = require('winston');

logger = new(winston.Logger)({
  transports: [
    new winston.transports.Console( {
      level: 'debug',
      colorize: true,
      timestamp: true,
      prettyPrint: true
    })
  ]
});

module.exports = logger;

