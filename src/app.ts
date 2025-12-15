import express from "express";
import cors from "cors";
import path from "path";
import userRoutes from "./routes/user.routes.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import objectiveRoutes from "./routes/objective.routes.js";
import planRoutes from "./routes/plan.routes.js";
import okrRoutes from "./routes/okr.routes.js";
import taskRoutes from "./routes/task.routes.js";
import aiRecommendationRoutes from "./routes/ai-recommendation.routes.js";
import userSettingsRoutes from "./routes/user-settings.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import focusRoutes from "./routes/focus.routes.js";
import cognitiveLoadRoutes from "./routes/cognitive-load.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import teamRoutes from "./routes/team.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();

// Configure CORS
app.use(cors({
  origin: ["https://workspace.iqniti.com","https://dashboard.iqniti.com","http://workspace-detail.s3-website.eu-north-1.amazonaws.com","http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Webhook routes need raw body for Stripe signature verification
// This must be before express.json() middleware
// Express v5: use express.raw() with proper type
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

// JSON body parser for all other routes
app.use(express.json());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/health", healthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/objectives", objectiveRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/okrs", okrRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/ai-recommendations", aiRecommendationRoutes);
app.use("/api/user-settings", userSettingsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", focusRoutes);
app.use("/api/cognitive-load", cognitiveLoadRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api", workspaceRoutes);
app.use("/api", teamRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/admin", adminRoutes);

export default app;
