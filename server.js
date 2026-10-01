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

/* =========================================
   YT-DLP VIDEO DOWNLOADER
========================================= */

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

  console.log("=================================");
  console.log("STARTING YT-DLP");
  console.log("YT-DLP PATH:", YTDLP);
  console.log("LINK:", link);
  console.log("=================================");

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

      downloadInstagramPhoto(link, res, id);
    }
  );
}

/* =========================================
   INSTAGRAM PHOTO FALLBACK
   NODE.JS ONLY
   NO PYTHON / REQUESTS
========================================= */

async function downloadInstagramPhoto(link, res, id) {

  const imageFile = path.join(
    DOWNLOAD_DIR,
    `${id}.jpg`
  );

  try {

    console.log("PHOTO FALLBACK STARTED");

    const response = await fetch(link, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

        "Accept-Language":
          "en-US,en;q=0.9",

        "Referer":
          "https://www.instagram.com/"
      }
    });

    console.log(
      "INSTAGRAM STATUS:",
      response.status
    );

    if (!response.ok) {
      throw new Error(
        `Instagram page returned HTTP ${response.status}`
      );
    }

    const html = await response.text();

    console.log(
      "INSTAGRAM HTML RECEIVED:",
      html.length,
      "characters"
    );

    let imageUrl = null;

    /* ---------------------------------
       OG IMAGE
    --------------------------------- */

    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );

    if (ogImageMatch) {
      imageUrl = ogImageMatch[1];
    }

    /* ---------------------------------
       REVERSE ATTRIBUTE ORDER
    --------------------------------- */

    if (!imageUrl) {

      const reverseOgMatch = html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );

      if (reverseOgMatch) {
        imageUrl = reverseOgMatch[1];
      }
    }

    /* ---------------------------------
       TWITTER IMAGE
    --------------------------------- */

    if (!imageUrl) {

      const twitterMatch = html.match(
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
      );

      if (twitterMatch) {
        imageUrl = twitterMatch[1];
      }
    }

    /* ---------------------------------
       REVERSE TWITTER ATTRIBUTE ORDER
    --------------------------------- */

    if (!imageUrl) {

      const reverseTwitterMatch = html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
      );

      if (reverseTwitterMatch) {
        imageUrl = reverseTwitterMatch[1];
      }
    }

    /* ---------------------------------
       DECODE HTML ENTITIES
    --------------------------------- */

    if (imageUrl) {

      imageUrl = imageUrl
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003D/g, "=")
        .replace(/\\u002F/g, "/");

    }

    if (!imageUrl) {

      console.log(
        "PHOTO URL NOT FOUND IN INSTAGRAM HTML"
      );

      return res.status(500).json({
        success: false,
        message:
          "Instagram photo could not be found. The post may require login or Instagram may have blocked the request."
      });
    }

    console.log(
      "PHOTO URL FOUND"
    );

    /* ---------------------------------
       DOWNLOAD IMAGE
    --------------------------------- */

    const imageResponse = await fetch(
      imageUrl,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

          "Referer":
            "https://www.instagram.com/"
        }
      }
    );

    console.log(
      "IMAGE STATUS:",
      imageResponse.status
    );

    if (!imageResponse.ok) {
      throw new Error(
        `Image download returned HTTP ${imageResponse.status}`
      );
    }

    const imageBuffer =
      Buffer.from(
        await imageResponse.arrayBuffer()
      );

    if (!imageBuffer.length) {
      throw new Error(
        "Downloaded image is empty"
      );
    }

    fs.writeFileSync(
      imageFile,
      imageBuffer
    );

    const size =
      fs.statSync(imageFile).size;

    console.log(
      "IMAGE SIZE:",
      size,
      "bytes"
    );

    if (size <= 0) {
      throw new Error(
        "Image file is empty"
      );
    }

    files.set(id, {
      path: imageFile,
      type: "image",
      created: Date.now()
    });

    console.log(
      "IMAGE READY:",
      id
    );

    cleanupFile(id);

    return res.json({
      success: true,
      type: "image",
      title: "Instagram Photo",
      mediaUrl: `/media/${id}`,
      downloadUrl: `/download-file/${id}`
    });

  } catch (error) {

    console.log(
      "PHOTO FALLBACK ERROR:",
      error.message
    );

    try {
      if (fs.existsSync(imageFile)) {
        fs.unlinkSync(imageFile);
      }
    } catch {}

    return res.status(500).json({
      success: false,
      message:
        "This Instagram photo could not be downloaded.",
      error: error.message
    });
  }
}

/* =========================================
   CLEANUP
========================================= */

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

    } catch (error) {

      console.log(
        "Cleanup error:",
        error.message
      );

    }

    files.delete(id);

    console.log(
      "FILE CLEANED:",
      id
    );

  }, 10 * 60 * 1000);
}

/* =========================================
   DOWNLOAD API
========================================= */

app.get("/download", (req, res) => {

  const link = req.query.link;

  console.log("=================================");
  console.log("REQUEST RECEIVED:");
  console.log(link);
  console.log("=================================");

  if (
    !link ||
    !link.includes("instagram.com")
  ) {

    return res.status(400).json({
      success: false,
      message:
        "Valid Instagram URL required"
    });
  }

  const id =
    crypto.randomUUID();

  const outputFile =
    path.join(
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

/* =========================================
   MEDIA PREVIEW
========================================= */

app.get("/media/:id", (req, res) => {

  const file =
    files.get(req.params.id);

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

/* =========================================
   ACTUAL DOWNLOAD
========================================= */

app.get(
  "/download-file/:id",
  (req, res) => {

    const file =
      files.get(req.params.id);

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

/* =========================================
   SERVER
========================================= */

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
      "Node.js Photo Fallback: ACTIVE"
    );

    console.log(
      "================================="
    );
  }
);