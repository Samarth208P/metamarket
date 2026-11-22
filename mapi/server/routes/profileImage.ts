import { Router } from "express";
import User from "../models/User.ts";
import {
  publicImageUrl,
  removeProfileImage,
  uploadImage,
} from "../services/images.ts";
import { ApiError, asyncRoute } from "./asyncRoute.ts";
import { parseImageUpload } from "./imageUpload.ts";

const router = Router();

async function discardImage(path: string | null) {
  if (!path) return;
  try {
    await removeProfileImage(path);
  } catch (error) {
    console.error("[Storage] Could not clean up profile image:", path, error);
  }
}

router.put(
  "/",
  parseImageUpload,
  asyncRoute(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, { error: "Choose an image to upload." });
    }
    const path = await uploadImage("profile-images", req.file.buffer);
    const profile = await User.updateAvatar(req.user.id, path).catch(
      async (error) => {
        await discardImage(path);
        throw error;
      },
    );
    if (!profile) {
      await discardImage(path);
      throw new ApiError(401, { error: "Account not found." });
    }
    await discardImage(profile.previousPath);
    res.json({ avatarUrl: publicImageUrl("profile-images", path) });
  }),
);

router.delete(
  "/",
  asyncRoute(async (req, res) => {
    const profile = await User.updateAvatar(req.user.id, null);
    if (!profile) {
      throw new ApiError(401, { error: "Account not found." });
    }
    await discardImage(profile.previousPath);
    res.json({ avatarUrl: null });
  }),
);

export default router;
