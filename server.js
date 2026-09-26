const express = require("express");
const cors = require("cors");
const youtubedl = require("youtube-dl-exec");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DOWNLOAD_DIR = path.join(os.tmpdir(), "instahub-ai");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const files = new Map();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/download", async (req, res) => {
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

  try {
    console.log("DOWNLOADING VIDEO...");

    await youtubedl(link, {
      noPlaylist: true,
      noWarnings: true,
      format: "best[ext=mp4]/best",
      output: outputFile,
      restrictFilenames: true,
      socketTimeout: 30000
    });

    console.log("CHECKING FILE...");

    if (!fs.existsSync(outputFile)) {
      throw new Error("MP4 file was not created");
    }

    const size = fs.statSync(outputFile).size;

    console.log("FILE SIZE:", size);

    if (size <= 0) {
      throw new Error("Downloaded file is empty");
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

  } catch (error) {

    console.log("DOWNLOAD ERROR:");
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Video download failed",
      error: error.message
    });
  }
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

  res.download(
    file.path,
    "instahub-ai-reel.mp4"
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("InstaHub AI running on port " + PORT);
  console.log("REAL VIDEO DOWNLOADER ACTIVE");
  console.log("=================================");
});