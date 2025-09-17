import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import objectiveRoutes from "./routes/objective.routes.js";
import planRoutes from "./routes/plan.routes.js";
import okrRoutes from "./routes/okr.routes.js";
import taskRoutes from "./routes/task.routes.js";

const app = express();

// Configure CORS
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use("/api/health", healthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/objectives", objectiveRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/okrs", okrRoutes);
app.use("/api/tasks", taskRoutes);

export default app;
