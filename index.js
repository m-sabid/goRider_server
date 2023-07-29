const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.SECRET_KEY_PAYMENT);
const nodemailer = require("nodemailer");

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
    const couponCollection = client.db("goRider").collection("coupons");

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
      const amount = Math.round(price * 100);

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

    const sendEmailAfterPayment = async (userEmail, payment) => {
      let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "sabidofficial@gmail.com",
          pass: "lszkondkparrwxsx",
        },
      });

      const users = await userEmail;

      let paymentDetails = `
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Price</th>
          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Car Name</th>
          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Vehicle Type</th>
          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Driver Name</th>
          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Transaction Id</th>
          <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;"> Distance</th>
        </tr>
        <tr>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${payment.price}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${payment.carName}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${payment.vehicleType}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${payment.driverName}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${payment.transactionId}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${payment.distance}km</td>
        </tr>
      </table>
    `;

      let mailOptions = {
        from: "sabidofficial@gmail.com",
        to: users,
        subject: "Payment successful: Have a nice day!",
        html: `<p>Thank you for your payment! Here are the payment details:</p>${paymentDetails}`,
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);
      } catch (error) {
        console.log(error);
      }
    };

    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const userEmail = payment.userEmail;

      console.log(userEmail);
      try {
        const result = await paymentCollection.insertOne(payment);
        sendEmailAfterPayment(userEmail, payment);

        if (result.insertedCount === 1) {
          // Payment successfully inserted, now delete item from pendingRide collection
          const deleteResult = await pendingRideCollection.deleteOne({
            rideId: payment.rideId,
          });

          if (deleteResult.deletedCount === 1) {
            res.json({
              success: true,
              message: "Payment successful. Item deleted from pendingRide.",
            });
          } else {
            res.json({
              success: false,
              message:
                "Payment successful, but failed to delete item from pendingRide.",
            });
          }
        } else {
          res.json({ success: false, message: "Failed to insert payment." });
        }
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).json({
          success: false,
          message: "An error occurred during payment processing.",
        });
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
        const { status, totalPrice, isCouponUsed } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
            totalPrice: totalPrice,
            isCouponUsed: isCouponUsed,
          },
        };

        const pendingRideCollection = client
          .db("goRider")
          .collection("pendingRide");

        const result = await pendingRideCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          // Ride updated successfully
          return res.json({ success: true });
        } else {
          // Failed to update the ride
          return res.json({ success: false });
        }
      } catch (error) {
        console.error("Error updating ride in MongoDB:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.delete("/pending-ride/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const filter = { _id: new ObjectId(id) };

        const pendingRideCollection = client
          .db("goRider")
          .collection("pendingRide");

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

    const sendEmailToAllUsers = async (subject, text) => {
      let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "sabidofficial@gmail.com",
          pass: "lszkondkparrwxsx",
        },
      });

      const users = await usersCollection.find().toArray();

      for (const user of users) {
        let mailOptions = {
          from: "sabidofficial@gmail.com",
          to: user.email,
          subject: subject,
          text: text,
        };

        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          } else {
            console.log("Email sent: " + info.response);
          }
        });
      }
    };

    // coupons apis
    app.post("/coupons", async (req, res) => {
      const coupon = req.body;

      try {
        // Check if a coupon with the same name already exists
        const existingCoupon = await couponCollection.findOne({
          name: coupon.name,
        });

        console.log(existingCoupon);

        if (existingCoupon) {
          return res.status(400).json({
            success: false,
            message: "Coupon with this name already exists.",
          });
        }

        const result = await couponCollection.insertOne(coupon);

        if (result.acknowledged === true) {
          // Coupon successfully inserted, now send email to all users
          const subject = "New Coupon Available!";
          const text = `A new coupon code is available. Use code: ${coupon.code} to get ${coupon.discount}% off on your next ride!`;

          sendEmailToAllUsers(subject, text);

          res.json({ success: true, message: "Coupon created successfully." });
        } else {
          res.json({ success: false, message: "Failed to insert coupon." });
        }
      } catch (error) {
        console.error("Error creating coupon:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/coupons", async (req, res) => {
      const couponName = req.query.name;

      try {
        if (couponName) {
          // Fetch a specific coupon by name
          const coupon = await couponCollection.findOne({ name: couponName });

          if (!coupon) {
            return res
              .status(404)
              .json({ success: false, message: "Coupon not found." });
          }

          res.json(coupon);
        } else {
          // Fetch all coupons
          const result = await couponCollection.find().toArray();
          res.json(result);
        }
      } catch (error) {
        console.error("Error retrieving coupons:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.delete("/coupons/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const filter = { _id: new ObjectId(id) };

        const couponCollection = client.db("goRider").collection("coupons");

        const result = await couponCollection.deleteOne(filter);

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

    // Coupon Related Apis

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } finally {
    // Ensure that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);
