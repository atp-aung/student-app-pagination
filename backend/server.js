require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;
const PAGE_SIZE = 3;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "student_page_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// GET: Search students (optional name and/or age) and return one page.
app.get("/api/students", async (req, res) => {
  try {
    const requestedPage = Number.parseInt(req.query.page, 10) || 1;
    const page = Math.max(1, requestedPage);
    const limit = PAGE_SIZE;

    const name =
      typeof req.query.name === "string" ? req.query.name.trim() : "";
    const ageValue = req.query.age;
    const conditions = [];
    const params = [];

    // Name uses partial matching. Age uses exact matching.
    if (name) {
      if (name.length > 100) {
        return res
          .status(400)
          .json({ message: "Name search must be 100 characters or fewer." });
      }
      conditions.push("name LIKE ?");
      params.push(`%${name}%`);
    }

    if (ageValue !== undefined && ageValue !== "") {
      const age = Number(ageValue);
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        return res
          .status(400)
          .json({
            message: "Age search must be a whole number between 1 and 120.",
          });
      }
      conditions.push("age = ?");
      params.push(age);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM students ${whereClause}`,
      params,
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;

    const [students] = await pool.execute(
      `SELECT id, name, age, created_at
       FROM students
       ${whereClause}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({
      data: students,
      total,
      page: safePage,
      pageSize: limit,
      totalPages,
    });
  } catch (error) {
    console.error("GET /api/students error:", error);
    res.status(500).json({ message: "Failed to retrieve students." });
  }
});

// POST: Register a student.
app.post("/api/students", async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const age = Number(req.body.age);

    if (!name || !Number.isInteger(age) || age < 1 || age > 120) {
      return res
        .status(400)
        .json({ message: "Please provide a valid name and age (1-120)." });
    }

    const [result] = await pool.execute(
      "INSERT INTO students (name, age) VALUES (?, ?)",
      [name, age],
    );

    res.status(201).json({
      message: "Student registered successfully.",
      student: { id: result.insertId, name, age },
    });
  } catch (error) {
    console.error("POST /api/students error:", error);
    res.status(500).json({ message: "Failed to register student." });
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("MySQL connection successful!");
    app.listen(PORT, () =>
      console.log(`Server running at http://localhost:${PORT}`),
    );
  } catch (error) {
    console.error("Unable to connect to MySQL:", error.message);
    process.exit(1);
  }
}

startServer();
