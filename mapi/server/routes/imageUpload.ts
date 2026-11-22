import type { RequestHandler } from "express";
import multer from "multer";
import { MAX_IMAGE_BYTES } from "../../../shared/api.ts";
import { ApiError } from "./asyncRoute.ts";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1, fields: 0 },
}).single("image");

export const parseImageUpload: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (error?.code === "LIMIT_FILE_SIZE") {
      return next(
        new ApiError(413, { error: "Images must be 5 MB or smaller." }),
      );
    }
    if (error) {
      return next(new ApiError(400, { error: "Send one image file." }));
    }
    next();
  });
};
