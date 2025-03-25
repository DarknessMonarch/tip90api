const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: ".env" });
const session = require("express-session");
const morgan = require("morgan");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const { connectDB } = require("./config/db");
const bodyParser = require("body-parser");

const authRoute = require("./routes/auth");
const bannerRoute = require("./routes/banner");
const paymentRoute = require("./routes/payment");
const predictionRoute = require("./routes/prediction");

connectDB();

const PORT = process.env.PORT || 5000;
const WEBSITE= process.env.WEBSITE_LINK

const corsOptions = {
  origin: WEBSITE,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(express.json());
app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(helmet());
app.use(morgan("dev"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_CONNECTION_URL }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// Routes
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/banner", bannerRoute);
app.use("/api/v1/payment", paymentRoute);
app.use("/api/v1/predictions", predictionRoute);

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "client", "index.html");
  res.sendFile(filePath);
});

app.options("/api/v1/auth/update-profile-image", cors(corsOptions));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred" });
});

setInterval(() => {
  fetch(`http://localhost:${PORT}/`)
    .then((res) => console.log("Keep-alive ping successful"))
    .catch((err) => console.error("Keep-alive ping failed", err));
}, 25 * 60 * 1000); // Ping every 25 minutes

app.listen(PORT, () => {
  console.log(`[+] Server running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("[-] Sayonara...");
  process.exit(0);
});
