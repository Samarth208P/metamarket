import { Router } from "express";
import User from "../models/User.js";

const router = Router();

// Middleware to ensure admin access
function ensureAdmin(req: any, res: any, next: any) {
  if (req.user?.isAdmin) return next();
  return res.status(403).json({ error: "Admin access required" });
}

/**
 * POST /admin/add
 * Promote a user to admin by email.
 */
router.post("/admin/add", ensureAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { isAdmin: true } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User with this email not found. They must sign in at least once." });
    }

    return res.json({ success: true, user: { email: user.email, name: user.name, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error("[AdminRoute] Error adding admin:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /admin/list
 * List all admins.
 */
router.get("/admin/list", ensureAdmin, async (req, res) => {
  try {
    const admins = await User.find({ isAdmin: true }).select("email name isAdmin");
    return res.json(admins);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /admin/remove
 * Remove admin status from a user.
 */
router.delete("/admin/remove", ensureAdmin, async (req, res) => {
  const { userId } = req.body;
  
  // Prevent removing own admin status
  if (userId === (req.user as any)?.id?.toString()) {
    return res.status(400).json({ error: "You cannot remove your own admin status" });
  }

  try {
    const user = await User.findByIdAndUpdate(userId, { $set: { isAdmin: false } }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
