import { Router } from "express";
import type { Request, Response } from "express";
import Stripe from "stripe";
import { subscriptionService } from "../services/subscription.service.js";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-10-29.clover",
});

/**
 * Stripe webhook handler
 * Note: This endpoint should be configured in Stripe Dashboard
 * and should NOT use the authenticateToken middleware
 * The route uses express.raw() middleware for signature verification
 */
router.post(
  "/stripe",
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      console.error("Missing stripe-signature header");
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    // Get webhook secret
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not set in environment variables");
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      // req.body MUST be a Buffer when using express.raw()
      // If it's not a Buffer, the middleware is misconfigured
      if (!Buffer.isBuffer(req.body)) {
        const bodyType = typeof req.body;
        console.error(`[Webhook] Invalid body format: expected Buffer, got ${bodyType}`);
        console.error("[Webhook] Check middleware configuration - express.raw() must be applied before this route");
        res.status(400).json({ 
          error: "Invalid body format - webhook middleware misconfigured",
          hint: "Ensure express.raw() middleware is applied to webhook routes"
        });
        return;
      }
      
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
      
      console.log(`[Webhook] Event received: ${event.type} (${event.id})`);
    } catch (err: any) {
      console.error("[Webhook] Signature verification failed:", err.message);
      console.error("[Webhook] Body type:", Buffer.isBuffer(req.body) ? "Buffer" : typeof req.body);
      console.error("[Webhook] Body length:", Buffer.isBuffer(req.body) ? req.body.length : "N/A");
      res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      return;
    }

    try {
      // Handle the event
      await subscriptionService.handleWebhookEvent(event);

      // Return a response to acknowledge receipt of the event
      res.json({ received: true });
    } catch (error: any) {
      console.error("Error handling webhook event:", error);
      res.status(500).json({ error: error.message || "Failed to handle webhook event" });
    }
  }
);

export default router;

