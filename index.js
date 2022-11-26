const express = require("express");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z9x1d7p.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAutthorized" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCES_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const productcollection = client.db("gears-zone").collection("products");
    const usercollection = client.db("gears-zone").collection("users");
    const ordercollection = client.db("gears-zone").collection("orders");
    const paymentcollection = client.db("gears-zone").collection("payments");
    const reviewcollection = client.db("gears-zone").collection("reviews");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await usercollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    app.get("/products", async (req, res) => {
      const query = {};
      const cursor = productcollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });
    app.post("/product", verifyJWT, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productcollection.insertOne(product);
      res.send(result);
    });

    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const cursor = await productcollection.findOne(query);
      res.send(cursor);
    });
    app.get("/user", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usercollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usercollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await usercollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const user = req.body;
      const email = req.params.email;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usercollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCES_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });

    app.get("/orders", verifyJWT, verifyAdmin, async (req, res) => {
      const orders = await ordercollection.find().toArray();
      res.send(orders);
    });

    app.get("/order", verifyJWT, async (req, res) => {
      const email = req.query.email;

      // const authorization = req.headers.authorization;
      // console.log("auth header", authorization);
      const decodedEmail = req.decoded.email;

      if (email === decodedEmail) {
        const query = { email: email };
        const orders = await ordercollection.find(query).toArray();
        res.send(orders);
      } else {
        return res.status(403).send({ message: "forbidden" });
      }
    });

    app.post("/orders", async (req, res) => {
      const order = req.body;

      const query = {
        userName: order.userName,
        productName: order.ProductName,
      };
      const exists = await ordercollection.findOne(query);
      if (exists) {
        return res.send({ success: false, order: exists });
      } else {
        const result = await ordercollection.insertOne(order);
        return res.send({ success: true, result });
      }
    });
    app.delete("/orders/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await ordercollection.deleteOne(filter);
      res.send(result);
    });
    app.get("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await ordercollection.findOne(query);
      return res.send(order);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = parseInt(price) * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.s;
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.patch("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedOrder = await ordercollection.updateOne(filter, updatedDoc);
      const result = await paymentcollection.insertOne(payment);
      res.send(updatedDoc);
    });

    app.post("/reviews", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewcollection.insertOne(review);
      res.send(result);
    });
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewcollection.find().toArray();
      res.send(reviews);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
