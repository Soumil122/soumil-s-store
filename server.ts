import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("store.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price REAL,
    stock INTEGER,
    category TEXT,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    total_price REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS helpline_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    status TEXT DEFAULT 'pending',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed initial products if empty
const productCount = db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number };
if (productCount.count === 0) {
  const seedProducts = [
    { name: "Pro Basketball", description: "Official size and weight professional basketball.", price: 29.99, stock: 50, category: "Basketball", image_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80" },
    { name: "Elite Soccer Ball", description: "High-performance soccer ball for all weather conditions.", price: 24.99, stock: 40, category: "Soccer", image_url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80" },
    { name: "Tennis Racket", description: "Lightweight carbon fiber tennis racket for precision.", price: 89.99, stock: 15, category: "Tennis", image_url: "https://images.unsplash.com/photo-1617083270696-0fa2d47437dd?w=800&q=80" },
    { name: "Running Shoes", description: "Breathable and cushioned shoes for long-distance running.", price: 119.99, stock: 25, category: "Running", image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80" },
    { name: "Yoga Mat", description: "Non-slip eco-friendly yoga mat for ultimate comfort.", price: 34.99, stock: 30, category: "Yoga", image_url: "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=800&q=80" },
    { name: "Dumbbell Set (10kg)", description: "Pair of 10kg dumbbells for strength training.", price: 49.99, stock: 20, category: "Gym", image_url: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&q=80" },
    { name: "Cricket Bat", description: "Grade 1 English Willow cricket bat.", price: 199.99, stock: 10, category: "Cricket", image_url: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80" },
    { name: "Swimming Goggles", description: "Anti-fog swimming goggles with UV protection.", price: 19.99, stock: 60, category: "Swimming", image_url: "https://images.unsplash.com/photo-1559166631-ef208440c75a?w=800&q=80" }
  ];

  const insert = db.prepare("INSERT INTO products (name, description, price, stock, category, image_url) VALUES (?, ?, ?, ?, ?, ?)");
  seedProducts.forEach(p => insert.run(p.name, p.description, p.price, p.stock, p.category, p.image_url));
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get("/api/products", (req, res) => {
    const products = db.prepare("SELECT * FROM products").all();
    res.json(products);
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    // Simple mock auth for demonstration
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) {
      // Auto-register for demo purposes if user doesn't exist
      db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)").run(email, password, email.split('@')[0]);
      user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    }
    res.json({ success: true, user });
  });

  app.post("/api/purchase", (req, res) => {
    const { userId, items } = req.body;
    
    const transaction = db.transaction(() => {
      for (const item of items) {
        const product = db.prepare("SELECT stock FROM products WHERE id = ?").get(item.id) as any;
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.name}`);
        }
        
        db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.id);
        db.prepare("INSERT INTO purchases (user_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)")
          .run(userId, item.id, item.quantity, item.price * item.quantity);
      }
    });

    try {
      transaction();
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/purchases/:userId", (req, res) => {
    const purchases = db.prepare(`
      SELECT p.*, pr.name as product_name, pr.image_url 
      FROM purchases p 
      JOIN products pr ON p.product_id = pr.id 
      WHERE p.user_id = ?
      ORDER BY p.timestamp DESC
    `).all(req.params.userId);
    res.json(purchases);
  });

  app.post("/api/helpline", (req, res) => {
    const { userId, message } = req.body;
    db.prepare("INSERT INTO helpline_messages (user_id, message) VALUES (?, ?)").run(userId, message);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
