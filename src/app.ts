import express from "express";
import userRoutes from "./routes/user.routes";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import projectRoutes from "./routes/project.routes";
import objectiveRoutes from "./routes/objective.routes";
import okrRoutes from "./routes/okr.routes";
import taskRoutes from "./routes/task.routes";

const app = express();

app.use(express.json());
app.use("/health", healthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/objectives", objectiveRoutes);
app.use("/api/okrs", okrRoutes);
app.use("/api/tasks", taskRoutes);

export default app;
