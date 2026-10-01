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

function downloadWithYtdlp(link, outputFile, res, id) {
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

  execFile(
    YTDLP,
    args,
    {
      timeout: 120000
    },
    (error, stdout, stderr) => {

      console.log("YT-DLP STDOUT:");
      console.log(stdout);

      console.log("YT-DLP STDERR:");
      console.log(stderr);

      if (!error && fs.existsSync(outputFile)) {
        const size = fs.statSync(outputFile).size;

        if (size > 0) {
          files.set(id, {
            path: outputFile,
            type: "video",
            created: Date.now()
          });

          console.log("VIDEO READY:", id);

          cleanupFile(id);

          return res.json({
            success: true,
            type: "video",
            title: "Instagram Post",
            mediaUrl: `/media/${id}`,
            downloadUrl: `/download-file/${id}`
          });
        }
      }

      console.log("YT-DLP DID NOT RETURN VIDEO.");
      console.log("TRYING PHOTO FALLBACK...");

      downloadInstagramImage(link, res, id);
    }
  );
}

function downloadInstagramImage(link, res, id) {

  const imageFile = path.join(
    DOWNLOAD_DIR,
    `${id}.jpg`
  );

  const pythonScript = `
import sys
import requests
from bs4 import BeautifulSoup

url = sys.argv[1]
output = sys.argv[2]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9"
}

r = requests.get(url, headers=headers, timeout=30)

if r.status_code != 200:
    raise Exception("Instagram page request failed")

soup = BeautifulSoup(r.text, "html.parser")

image_url = None

meta = soup.find("meta", property="og:image")

if meta:
    image_url = meta.get("content")

if not image_url:
    meta = soup.find("meta", attrs={"name": "twitter:image"})

    if meta:
        image_url = meta.get("content")

if not image_url:
    raise Exception("Instagram image URL not found")

img = requests.get(
    image_url,
    headers=headers,
    timeout=30
)

if img.status_code != 200:
    raise Exception("Instagram image download failed")

with open(output, "wb") as f:
    f.write(img.content)

print("IMAGE_READY")
`;

  const scriptFile = path.join(
    DOWNLOAD_DIR,
    `${id}.py`
  );

  fs.writeFileSync(scriptFile, pythonScript);

  execFile(
    "python3",
    [
      scriptFile,
      link,
      imageFile
    ],
    {
      timeout: 60000
    },
    (error, stdout, stderr) => {

      console.log("PHOTO FALLBACK STDOUT:");
      console.log(stdout);

      console.log("PHOTO FALLBACK STDERR:");
      console.log(stderr);

      try {
        if (fs.existsSync(scriptFile)) {
          fs.unlinkSync(scriptFile);
        }
      } catch {}

      if (error || !fs.existsSync(imageFile)) {

        console.log(
          "PHOTO FALLBACK FAILED:",
          error ? error.message : "Image not found"
        );

        return res.status(500).json({
          success: false,
          message: "This Instagram post could not be downloaded.",
          error:
            stderr ||
            (error ? error.message : "Image not found")
        });
      }

      const size = fs.statSync(imageFile).size;

      if (size <= 0) {
        return res.status(500).json({
          success: false,
          message: "Downloaded image is empty."
        });
      }

      files.set(id, {
        path: imageFile,
        type: "image",
        created: Date.now()
      });

      console.log("IMAGE READY:", id);

      cleanupFile(id);

      return res.json({
        success: true,
        type: "image",
        title: "Instagram Post",
        mediaUrl: `/media/${id}`,
        downloadUrl: `/download-file/${id}`
      });
    }
  );
}

function cleanupFile(id) {

  setTimeout(() => {

    const file = files.get(id);

    if (!file) {
      return;
    }

    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      console.log(
        "Cleanup error:",
        e.message
      );
    }

    files.delete(id);

  }, 10 * 60 * 1000);
}

app.get("/download", (req, res) => {

  const link = req.query.link;

  console.log(
    "REQUEST RECEIVED:",
    link
  );

  if (
    !link ||
    !link.includes("instagram.com")
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid Instagram URL required"
    });
  }

  const id = crypto.randomUUID();

  const outputFile = path.join(
    DOWNLOAD_DIR,
    `${id}.mp4`
  );

  downloadWithYtdlp(
    link,
    outputFile,
    res,
    id
  );
});

app.get("/media/:id", (req, res) => {

  const file = files.get(
    req.params.id
  );

  if (
    !file ||
    !fs.existsSync(file.path)
  ) {
    return res
      .status(404)
      .send(
        "Media not found or expired."
      );
  }

  if (file.type === "image") {
    res.type("jpg");
  } else {
    res.type("mp4");
  }

  res.sendFile(file.path);
});

app.get(
  "/download-file/:id",
  (req, res) => {

    const file = files.get(
      req.params.id
    );

    if (
      !file ||
      !fs.existsSync(file.path)
    ) {
      return res
        .status(404)
        .send(
          "Media not found or expired."
        );
    }

    if (file.type === "image") {

      return res.download(
        file.path,
        "instahub-ai-post.jpg"
      );

    }

    return res.download(
      file.path,
      "instahub-ai-post.mp4"
    );
  }
);

const PORT =
  process.env.PORT || 10000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      "InstaHub AI running on port " +
      PORT
    );

    console.log(
      "YT-DLP PATH:",
      YTDLP
    );

    console.log(
      "================================="
    );
  }
);