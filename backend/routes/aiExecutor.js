const express = require("express");
const axios = require("axios");
const router = express.Router();
const Item = require("../models/Item");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

if (!GROQ_API_KEY) console.error("❌ Missing GROQ_API_KEY in .env!");

// 🧠 Memory for conversation context
let chatMemory = [
  {
    role: "system",
    content: `
You are "Smart Inventory Assistant" — a friendly, human-like AI that manages inventory.
You talk naturally, use emojis, and handle MongoDB operations using JSON inside <json>...</json> tags.

Supported actions:
["add_item","update_quantity","increase_quantity","reduce_quantity","update_price","delete_item","show_items","show_category","show_item","show_price","low_stock","total_value","help"]

Rules:
- Respond conversationally.
- When an operation is detected, return a JSON array in <json>...</json>.
- For small talk, just chat like a person.

Examples:
User: add 5 apples at 50
AI: Got it 🍎! Added 5 apples to stock.
<json>[{"intent":"add_item","item":"apple","quantity":5,"price":50}]</json>

User: delete 2 candles
AI: Removed 2 candles 🕯️.
<json>[{"intent":"reduce_quantity","item":"candle","quantity":2}]</json>

User: hi
AI: Hey there 👋 how’s your day going?
`
  }
];

// 🔹 Category detection
function inferCategory(name) {
  name = name.toLowerCase();
  if (/(apple|banana|mango|milk|rice|bread|sugar|salt|oil|tea|coffee)/.test(name)) return "Grocery";
  if (/(tv|mobile|phone|laptop|computer|charger|headphone|camera|tablet)/.test(name)) return "Electronics";
  if (/(chair|table|sofa|bed|furniture|cupboard|desk)/.test(name)) return "Furniture";
  if (/(book|pen|pencil|notebook|eraser|marker|stationery)/.test(name)) return "Stationery";
  if (/(shirt|jeans|tshirt|jacket|dress|clothes)/.test(name)) return "Fashion";
  return "General";
}

// 🔹 Auto minStock
function autoMinStock(category, price) {
  if (category === "Grocery") return 10;
  if (category === "Electronics") return price > 1000 ? 2 : 5;
  if (category === "Furniture") return 3;
  if (category === "Stationery") return 5;
  if (category === "Fashion") return 4;
  return 5;
}

// 🔍 Fuzzy item finder
async function findItemFuzzy(name) {
  if (!name) return null;
  const regex = new RegExp(`^${name}s?$`, "i");
  let found = await Item.findOne({ name: regex });
  if (!found) {
    const alt = new RegExp(name, "i");
    found = await Item.findOne({ name: alt });
  }
  return found;
}

// 🔹 Talk to Groq
async function talkToAI(userMessage) {
  try {
    chatMemory.push({ role: "user", content: userMessage });

    const { data } = await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL,
        messages: chatMemory,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const reply = data?.choices?.[0]?.message?.content || "Hmm, I didn’t get that 🤔";
    chatMemory.push({ role: "assistant", content: reply });
    return reply;
  } catch (err) {
    console.error("❌ AI Error:", err.response?.data || err.message);
    return "AI connection issue — check Groq key.";
  }
}

// 🔹 Main processor
router.post("/process", async (req, res) => {
  const { command } = req.body;
  if (!command) return res.json({ success: false, message: "Say something first 😅" });

  const aiReply = await talkToAI(command);

  // Extract <json> actions
  const jsonMatch = aiReply.match(/<json>([\s\S]*?)<\/json>/);
  if (!jsonMatch) return res.json({ success: true, message: aiReply });

  let actions;
  try {
    actions = JSON.parse(jsonMatch[1]);
  } catch {
    return res.json({ success: true, message: aiReply });
  }

  const responses = [];

  for (const ai of actions) {
    let result = "";

    switch (ai.intent) {
      // 🟢 Add item (auto average price)
      case "add_item": {
        const { item, quantity = 0, price = 0 } = ai;
        const category = inferCategory(item);
        const minStock = autoMinStock(category, price);
        let existing = await findItemFuzzy(item);

        if (existing) {
          // 📊 auto average price logic
          if (price > 0 && existing.price > 0) {
            const totalValue = (existing.quantity * existing.price) + (quantity * price);
            existing.price = totalValue / (existing.quantity + quantity);
          } else if (price > 0 && existing.price === 0) {
            existing.price = price;
          }

          existing.quantity += quantity;
          if (!existing.minStock) existing.minStock = minStock;
          await existing.save();
          result = `🔄 Updated ${existing.name}: +${quantity}, now ${existing.quantity} in stock (₹${existing.price.toFixed(2)} each).`;
        } else {
          const newItem = new Item({ name: item, category, quantity, price, minStock });
          await newItem.save();
          result = `✅ Added ${quantity} ${item}(s) in ${category} at ₹${price}.`;
        }
        break;
      }

      // 📊 Update quantity directly
      case "update_quantity": {
        const { item, quantity } = ai;
        const found = await findItemFuzzy(item);
        if (!found) result = `❌ Couldn't find ${item}.`;
        else {
          const old = found.quantity;
          found.quantity = quantity;
          await found.save();
          result = `📊 Updated ${found.name} quantity: ${old} → ${quantity}.`;
        }
        break;
      }

      // 🔼 Increase (with total value)
      case "increase_quantity": {
        const { item, quantity } = ai;
        const found = await findItemFuzzy(item);
        if (!found) result = `❌ No ${item} found.`;
        else {
          const oldQty = found.quantity;
          found.quantity += quantity;
          await found.save();
          const totalValue = found.quantity * found.price;
          result = `🔼 Increased ${found.name} by ${quantity}. Now ${found.quantity} × ₹${found.price.toFixed(2)} = ₹${totalValue.toFixed(2)}.`;
        }
        break;
      }

      // 🔽 Reduce / Delete (auto total update)
      case "reduce_quantity":
      case "delete_item": {
        const { item, quantity } = ai;
        const found = await findItemFuzzy(item);
        if (!found) {
          result = `❌ No ${item} found to delete.`;
        } else {
          const qty = Number(quantity) || 0;
          if (qty > 0) {
            if (found.quantity <= qty) {
              await Item.findByIdAndDelete(found._id);
              result = `🧹 Removed all ${found.name}(s) from stock.`;
            } else {
              found.quantity -= qty;
              await found.save();
              const totalValue = found.quantity * found.price;
              result = `🔽 Reduced ${found.name} by ${qty}. Remaining: ${found.quantity} × ₹${found.price.toFixed(2)} = ₹${totalValue.toFixed(2)}.`;
            }
          } else {
            await Item.findByIdAndDelete(found._id);
            result = `🧹 Deleted ${found.name} completely from stock.`;
          }
        }
        break;
      }

      // 💸 Update price
      case "update_price": {
        const { item, price } = ai;
        const found = await findItemFuzzy(item);
        if (!found) result = `❌ Can't find ${item}.`;
        else {
          const old = found.price;
          found.price = price;
          await found.save();
          result = `💸 Updated ${found.name} price: ₹${old} → ₹${price}.`;
        }
        break;
      }

      // 📦 Show all
      case "show_items": {
        const items = await Item.find();
        if (!items.length) result = "📭 Inventory is empty.";
        else {
          const lines = items.map(i => `• ${i.name} (${i.category}) — ${i.quantity}/${i.minStock} × ₹${i.price}`);
          result = `📦 Full Inventory:\n${lines.join("\n")}`;
        }
        break;
      }

      // 📁 Category
      case "show_category": {
        const cat = ai.category?.trim() || "";
        const items = await Item.find({ category: new RegExp(cat, "i") });
        if (!items.length) result = `❌ No items found in ${cat}.`;
        else {
          const lines = items.map(i => `• ${i.name} — ${i.quantity}/${i.minStock} × ₹${i.price}`);
          result = `📁 ${cat.toUpperCase()} Items:\n${lines.join("\n")}`;
        }
        break;
      }

      // 🔍 Single item
      case "show_item": {
        const { item } = ai;
        const found = await findItemFuzzy(item);
        if (!found) result = `❌ No item named ${item}.`;
        else result = `📦 ${found.name} — ${found.quantity}/${found.minStock} × ₹${found.price} (${found.category})`;
        break;
      }

      // 💰 Price
      case "show_price": {
        const { item } = ai;
        const found = await findItemFuzzy(item);
        if (!found) result = `❌ Can't find ${item}.`;
        else result = `💸 The price of ${found.name} is ₹${found.price}.`;
        break;
      }

      // ⚠️ Low stock
      case "low_stock": {
        const low = await Item.find({ $expr: { $lt: ["$quantity", "$minStock"] } });
        if (!low.length) result = "✅ All items are sufficiently stocked!";
        else {
          const lines = low.map(i => `• ${i.name}: ${i.quantity}/${i.minStock}`);
          result = `⚠️ Low stock alert:\n${lines.join("\n")}`;
        }
        break;
      }

      // 💰 Total value
      case "total_value": {
        const items = await Item.find();
        const total = items.reduce((sum, i) => sum + (i.quantity * i.price), 0);
        result = `💰 Total inventory value is ₹${total.toLocaleString()}.`;
        break;
      }

      // 🤖 Help
      default:
        result = `
🤖 I can help you with:
• Add / Delete / Update items  
• Show item details or price  
• Check low stock  
• Calculate total value  
• Or just chat casually 😄
        `.trim();
    }

    responses.push(result);
  }

  const finalResponse = `${aiReply.split("<json>")[0].trim()}\n\n${responses.join("\n")}`;
  res.json({ success: true, message: finalResponse });
});

module.exports = router;
