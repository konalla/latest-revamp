import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import projectRoutes from "./routes/project.routes";
import objectiveRoutes from "./routes/objective.routes";
import planRoutes from "./routes/plan.routes";
import okrRoutes from "./routes/okr.routes";
import taskRoutes from "./routes/task.routes";

const app = express();

// Configure CORS
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use("/health", healthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/objectives", objectiveRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/okrs", okrRoutes);
app.use("/api/tasks", taskRoutes);

export default app;
