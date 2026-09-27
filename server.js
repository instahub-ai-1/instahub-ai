const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DOWNLOAD_DIR = path.join(os.tmpdir(), "instahub-ai");
const YTDLP = "/usr/local/bin/yt-dlp";

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const files = new Map();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/download", (req, res) => {
  const link = req.query.link;

  console.log("REQUEST RECEIVED:", link);

  if (!link || !link.includes("instagram.com")) {
    return res.status(400).json({
      success: false,
      message: "Valid Instagram URL required"
    });
  }

  const id = crypto.randomUUID();
  const outputFile = path.join(DOWNLOAD_DIR, `${id}.mp4`);

  const args = [
    link,
    "--no-playlist",
    "--no-warnings",
    "--format",
    "best[ext=mp4]/best",
    "--output",
    outputFile,
    "--restrict-filenames",
    "--socket-timeout",
    "60",
    "--retries",
    "3",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    "--referer",
    "https://www.instagram.com/"
  ];

  console.log("STARTING YT-DLP...");
  console.log("YT-DLP PATH:", YTDLP);

  execFile(YTDLP, args, {
    timeout: 120000
  }, (error, stdout, stderr) => {

    console.log("YT-DLP STDOUT:");
    console.log(stdout);

    console.log("YT-DLP STDERR:");
    console.log(stderr);

    if (error) {
      console.log("YT-DLP ERROR");
      console.log("MESSAGE:", error.message);
      console.log("CODE:", error.code);

      return res.status(500).json({
        success: false,
        message: "Video download failed",
        error: stderr || error.message
      });
    }

    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({
        success: false,
        message: "Video file was not created"
      });
    }

    const size = fs.statSync(outputFile).size;

    console.log("FILE SIZE:", size);

    if (size <= 0) {
      return res.status(500).json({
        success: false,
        message: "Downloaded file is empty"
      });
    }

    files.set(id, {
      path: outputFile,
      created: Date.now()
    });

    console.log("VIDEO READY:", id);

    setTimeout(() => {
      const file = files.get(id);

      if (file) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (e) {
          console.log("Cleanup error:", e.message);
        }

        files.delete(id);
      }
    }, 10 * 60 * 1000);

    return res.json({
      success: true,
      title: "Instagram Reel",
      mediaUrl: `/media/${id}`,
      downloadUrl: `/download-file/${id}`
    });
  });
});

app.get("/media/:id", (req, res) => {
  const file = files.get(req.params.id);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).send("Video not found or expired.");
  }

  res.sendFile(file.path);
});

app.get("/download-file/:id", (req, res) => {
  const file = files.get(req.params.id);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).send("Video not found or expired.");
  }

  res.download(file.path, "instahub-ai-reel.mp4");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("InstaHub AI running on port " + PORT);
  console.log("YT-DLP PATH:", YTDLP);
  console.log("=================================");
});