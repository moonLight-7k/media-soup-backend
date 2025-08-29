import winston from "winston";
import chalk from "chalk";
import fs from "fs";
import path from "path";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

type Level = keyof typeof levels;

const colors: Record<Level, (msg: string) => string> = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.green,
  http: chalk.magenta,
  verbose: chalk.cyan,
  debug: chalk.blue,
  silly: chalk.gray,
};

const logDir = path.join(__dirname, "../debug");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const currentDate = new Date().toISOString().split("T")[0];
const logFilePath = path.join(logDir, `${currentDate}.log`);

const format = winston.format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    const color = colors[level as Level] || ((msg: string) => msg);
    let logMessage = `${chalk.gray(timestamp)} ${color(level)}: ${message}`;

    if (Object.keys(metadata).length > 0) {
      logMessage += ` ${JSON.stringify(metadata)}`;
    }

    return logMessage;
  }
);

const logger = winston.createLogger({
  levels,
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    format
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: logFilePath,
      level: "debug",
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.json()
      ),
    }),
  ],
});

export default logger;
