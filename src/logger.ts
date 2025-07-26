import winston from "winston";
import chalk from "chalk";
import fs from "fs";
import path from "path";

// Define log levels
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

// Define colors for each level using chalk
const colors: Record<Level, (msg: string) => string> = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.green,
  http: chalk.magenta,
  verbose: chalk.cyan,
  debug: chalk.blue,
  silly: chalk.gray,
};

// Create log directory if it doesn't exist
const logDir = path.join(__dirname, "../debug");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Get current date for log filename
const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
const logFilePath = path.join(logDir, `${currentDate}.log`);

// Define custom log format
const format = winston.format.printf(({ level, message, timestamp }) => {
  const color = colors[level as Level] || ((msg: string) => msg);
  return `${chalk.gray(timestamp)} ${color(level)}: ${message}`;
});

// Create logger instance
const logger = winston.createLogger({
  levels,
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }), // include error stack
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
