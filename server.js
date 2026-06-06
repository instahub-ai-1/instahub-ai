const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/download", async (req, res) => {
  const link = req.query.link;

  if (!link || !link.includes("instagram.com")) {
    return res.json({
      success: false,
      message: "Invalid Instagram Link"
    });
  }

  res.json({
    success: true,
    username: "instahub_ai",
    caption: "Instagram Reel Ready 🚀",
    thumbnail:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800",
    downloadUrl:
      "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
  });
});

app.listen(3000, () => {
  console.log("Server Running on http://localhost:3000");
});