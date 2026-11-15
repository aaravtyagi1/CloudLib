const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const path = require("path");

// Configure S3 Client using default AWS credential provider chain
// On EC2, this automatically uses the IAM Instance Profile (CloudLib-EC2-Role).
// In local development, it can use ~/.aws/credentials or environment variables.
const region = process.env.AWS_REGION || "eu-north-1";
const bucketName = process.env.S3_UPLOAD_BUCKET || process.env.AWS_BUCKET_NAME;

const s3Client = new S3Client({
  region,
});

/**
 * Validate file MIME type and extension
 */
const ALLOWED_MIME_TYPES = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

/**
 * Generate a unique, safe S3 object key
 */
const generateObjectKey = (folder = "uploads", extension = ".jpg") => {
  const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  const uniqueId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return `${cleanFolder}/${uniqueId}-${timestamp}${ext}`;
};

/**
 * Parse base64 Data URL or raw buffer
 */
const parseFileData = (fileData) => {
  if (Buffer.isBuffer(fileData)) {
    return {
      buffer: fileData,
      contentType: "application/octet-stream",
      extension: ".bin",
    };
  }

  if (typeof fileData === "string") {
    // Check for base64 data URI: data:[<mediatype>];base64,<data>
    const match = fileData.match(/^data:([a-zA-Z0-9_\-+/.]+);base64,(.+)$/);
    if (match) {
      const contentType = match[1].toLowerCase();
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, "base64");
      const extension = ALLOWED_MIME_TYPES[contentType] || ".bin";

      return { buffer, contentType, extension };
    }

    // Raw base64 string without data: header (default to jpeg)
    if (/^[A-Za-z0-9+/=]+$/.test(fileData.trim().substring(0, 50))) {
      const buffer = Buffer.from(fileData, "base64");
      return { buffer, contentType: "image/jpeg", extension: ".jpg" };
    }
  }

  throw new Error("Invalid file format. Expected a base64 Data URL or Buffer.");
};

/**
 * Upload a file to S3
 * Keeps buckets private (NO public-read ACL).
 * Returns { key, public_id, url }
 */
const uploadToS3 = async (fileData, folder = "uploads") => {
  if (!bucketName) {
    throw new Error(
      "S3 upload failed: S3_UPLOAD_BUCKET environment variable is not configured."
    );
  }

  const { buffer, contentType, extension } = parseFileData(fileData);

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds the 10MB limit (size: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB).`);
  }

  const key = generateObjectKey(folder, extension);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return {
    key,
    public_id: key,
    url: key,
    secure_url: key,
  };
};

/**
 * Delete an object from S3
 */
const deleteFromS3 = async (keyOrPublicId) => {
  if (!keyOrPublicId || typeof keyOrPublicId !== "string") return false;

  // Safeguard against placeholder values
  if (
    keyOrPublicId === "sample_id" ||
    keyOrPublicId === "profileUrl" ||
    keyOrPublicId === "default"
  ) {
    return false;
  }

  // If this is an external URL or non-S3 key, don't attempt S3 deletion
  if (keyOrPublicId.startsWith("http://") || keyOrPublicId.startsWith("https://")) {
    if (!bucketName || !keyOrPublicId.includes(bucketName)) {
      return false;
    }
  }

  if (!bucketName) {
    console.warn("S3 delete warning: S3_UPLOAD_BUCKET is not configured.");
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: keyOrPublicId,
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.warn(`Failed to delete object "${keyOrPublicId}" from S3:`, error.message);
    return false;
  }
};

/**
 * Generate a presigned download URL for private S3 objects
 */
const getPresignedDownloadUrl = async (key, expiresIn = 3600) => {
  if (!key || typeof key !== "string") return "";

  // If already an external URL (e.g. external image), return as is
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }

  // If placeholder
  if (key === "sample_id" || key === "profileUrl" || key === "default") {
    return "/Profile.png";
  }

  if (!bucketName) {
    return key;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error(`Error generating presigned download URL for ${key}:`, error.message);
    return key;
  }
};

/**
 * Generate a presigned upload URL for direct client-to-S3 uploads
 */
const getPresignedUploadUrl = async (folder = "uploads", fileType = "image/jpeg", expiresIn = 900) => {
  if (!bucketName) {
    throw new Error("S3_UPLOAD_BUCKET environment variable is not configured.");
  }

  const extension = ALLOWED_MIME_TYPES[fileType.toLowerCase()] || ".bin";
  const key = generateObjectKey(folder, extension);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    uploadUrl,
    key,
    public_id: key,
    expiresIn,
  };
};

/**
 * Resolves a media object or key into a displayable URL:
 * - Keeps external URLs intact
 * - Generates presigned URLs for private S3 keys
 * - Leaves standard local fallbacks intact
 */
const resolveMediaUrl = async (mediaItem, expiresIn = 3600) => {
  if (!mediaItem) return mediaItem;

  if (typeof mediaItem === "string") {
    return await getPresignedDownloadUrl(mediaItem, expiresIn);
  }

  if (typeof mediaItem === "object") {
    const itemCopy = { ...mediaItem };
    const targetKey = itemCopy.url || itemCopy.public_id || itemCopy.key;
    if (targetKey) {
      itemCopy.url = await getPresignedDownloadUrl(targetKey, expiresIn);
    }
    return itemCopy;
  }

  return mediaItem;
};

/**
 * Recursively resolves images and avatars in documents returned to frontend
 */
const resolveDocumentMedia = async (doc) => {
  if (!doc) return doc;

  if (Array.isArray(doc)) {
    return await Promise.all(doc.map((item) => resolveDocumentMedia(item)));
  }

  if (typeof doc === "object") {
    const copy = { ...doc };

    // Resolve avatar if present
    if (copy.avatar) {
      copy.avatar = await resolveMediaUrl(copy.avatar);
    }

    // Resolve images array if present
    if (Array.isArray(copy.images)) {
      copy.images = await Promise.all(
        copy.images.map((img) => resolveMediaUrl(img))
      );
    }

    // Resolve orderItems image if present
    if (Array.isArray(copy.orderItems)) {
      copy.orderItems = await Promise.all(
        copy.orderItems.map(async (item) => {
          const itemCopy = { ...item };
          if (itemCopy.image) {
            itemCopy.image = await getPresignedDownloadUrl(itemCopy.image);
          }
          return itemCopy;
        })
      );
    }

    return copy;
  }

  return doc;
};

module.exports = {
  s3Client,
  uploadToS3,
  deleteFromS3,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  resolveMediaUrl,
  resolveDocumentMedia,
  generateObjectKey,
};
