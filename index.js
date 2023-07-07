const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.SECRET_KEY_PAYMENT);

const port = process.env.PORT || 3000;

// middleware
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    const dbConnect = async () => {
      try {
        client.connect();
        console.log("DB Connect Successfully");
      } catch (error) {}
    };
    dbConnect();

    // All Collections
    const usersCollection = client.db("goRider").collection("users");
    const carsCollection = client.db("goRider").collection("cars");
    const paymentCollection = client.db("goRider").collection("payment");
    const pendingRideCollection = client
      .db("goRider")
      .collection("pendingRide");

    // Middleware
    // Admin verification middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // Default Api
    app.get("/", (req, res) => {
      res.send("Server Running");
    });

    // Users related APIs
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user"; // Set the default role as "user"

      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.json({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.json(result);
    });

    app.patch("/user/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: role,
          },
        };

        const usersCollection = client.db("goRider").collection("users");

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          // Role updated successfully
          return res.json({ success: true });
        } else {
          // Failed to update the role
          return res.json({ success: false });
        }
      } catch (error) {
        console.error("Error updating user role in MongoDB:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Car Related Apis
    app.post("/cars", async (req, res) => {
      try {
        const {
          carName,
          vehicleType,
          vehicleImage,
          driverName,
          driverEmail,
          seats,
          ePrice,
        } = req.body;

        // Check for required fields
        if (
          !carName ||
          !vehicleType ||
          !vehicleImage ||
          !driverName ||
          !driverEmail ||
          !seats ||
          !ePrice
        ) {
          console.log("All file not coming");
          return res.status(400).json({ error: "All fields are required" });
        }

        // Validate numeric fields
        if (isNaN(seats) || isNaN(ePrice)) {
          console.log("Validate error");
          return res
            .status(400)
            .json({ error: "Seats and Price should be numerical values" });
        }

        const car = {
          carName,
          vehicleType,
          vehicleImage,
          driverName,
          driverEmail,
          seats: parseInt(seats),
          ePrice: parseFloat(ePrice),
          status: "pending",
        };

        const result = await carsCollection.insertOne(car);
        res.json(result);
      } catch (error) {
        console.error("Error creating car:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/cars", async (req, res) => {
      try {
        const result = await carsCollection.find().toArray();
        res.json(result);
      } catch (error) {
        console.error("Error retrieving cars:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.patch("/cars/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updateFields = req.body;

        // Exclude the _id field from the updateFields object
        delete updateFields._id;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updateFields,
        };

        const result = await carsCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          // Car updated successfully
          return res.json({ success: true });
        } else {
          // Failed to update the car
          return res.json({ success: false });
        }
      } catch (error) {
        console.error("Error updating car in MongoDB:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.delete("/cars/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const filter = { _id: new ObjectId(id) };

        const result = await carsCollection.deleteOne(filter);

        if (result.deletedCount === 1) {
          // Car deleted successfully
          return res.json({ success: true });
        } else {
          // Failed to delete the car
          return res.json({ success: false });
        }
      } catch (error) {
        console.error("Error deleting car from MongoDB:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Car Related Apis

    // Payment Related Api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post("/payment", async (req, res) => {
      const payment = req.body;

      console.log(payment.rideId)
      try {
        const result = await paymentCollection.insertOne(payment);
    
        if (result.insertedCount === 1) {
          // Payment successfully inserted, now delete item from pendingRide collection
          const deleteResult = await pendingRideCollection.deleteOne({ rideId: payment.rideId });
    
          if (deleteResult.deletedCount === 1) {
            res.json({ success: true, message: "Payment successful. Item deleted from pendingRide." });
          } else {
            res.json({ success: false, message: "Payment successful, but failed to delete item from pendingRide." });
          }
        } else {
          res.json({ success: false, message: "Failed to insert payment." });
        }
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).json({ success: false, message: "An error occurred during payment processing." });
      }
    });
    
    app.get("/payment", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.json(result);
    });

    // Payment Related Api

    // Ride Related Route
    app.post("/pending-ride", async (req, res) => {
      const pendingRide = req.body;
      const result = await pendingRideCollection.insertOne(pendingRide);
      res.json(result);
    });
    app.get("/pending-ride", async (req, res) => {
      const result = await pendingRideCollection.find().toArray();
      res.json(result);
    });
    app.patch("/pending-ride/:id", async (req, res) => {
      try {
        const id = req.params.id;

       
        const { status } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const pendingRideCollection = client
          .db("goRider")
          .collection("pendingRide");

        const result = await pendingRideCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          // Role updated successfully
          return res.json({ success: true });
        } else {
          // Failed to update the role
          return res.json({ success: false });
        }
      } catch (error) {
        console.error("Error updating user role in MongoDB:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });
    app.delete("/pending-ride/:id", async (req, res) => {

      console.log("first")
      try {
        const id = req.params.id;
    
        const filter = { _id: new ObjectId(id) };
    
        const pendingRideCollection = client.db("goRider").collection("pendingRide");
    
        const result = await pendingRideCollection.deleteOne(filter);
    
        if (result.deletedCount === 1) {
          // Document deleted successfully
          return res.json({ success: true });
        } else {
          // Failed to delete the document
          return res.json({ success: false });
        }
      } catch (error) {
        console.error("Error deleting document from MongoDB:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });
    
    // Ride Related Route

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } finally {
    // Ensure that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);
