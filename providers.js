export const DEMO_NOTICE = "Demonstration data. Not live pricing.";

   const BASE = {
     default: { transport: 2400, hotel: 3200, food: 1500, local: 800, activities: 1200 },
     manali:  { transport: 2400, hotel: 3200, food: 1500, local: 800, activities: 1200 },
     goa:     { transport: 2800, hotel: 3600, food: 1800, local: 600, activities: 1000 },
     jaipur:  { transport: 1800, hotel: 2600, food: 1400, local: 700, activities: 900 }
   };
   
   export const baseCosts = (dest = "") => ({ ...(BASE[dest.toLowerCase().trim()] || BASE.default) });
   
   export async function getPackages(destination, { days = 4 } = {}) {
     const b = baseCosts(destination);
     const selfTotal = Object.values(b).reduce((a, c) => a + c, 0);
     const mk = (provider, mult, extra) => ({
       provider, destination, duration: days, pricePerPerson: Math.round(selfTotal * mult / 100) * 100 - 1,
       transportIncluded: true, accommodationIncluded: true, demo: true, ...extra
     });
     return [
       mk("MakeMyTrip", 1.47, { meals: "Breakfast", activitiesIncluded: 3, flexibilityScore: 70, planningEffortScore: 90, cancellation: "Partial refund", support: "Phone and chat" }),
       mk("Kesari", 1.88, { duration: days + 1, meals: "All meals", activitiesIncluded: 6, flexibilityScore: 35, planningEffortScore: 98, cancellation: "Strict", support: "On-trip manager" }),
       mk("Thomas Cook", 1.65, { meals: "Breakfast, dinner", activitiesIncluded: 4, flexibilityScore: 55, planningEffortScore: 94, cancellation: "Partial refund", support: "Phone" })
     ];
   }
   
   export const MODES = { cheapest: 0.85, balanced: 1, premium: 1.6 };
   
   
   export function recommend(options, prefs) {
     const prices = options.map(o => o.pricePerPerson), min = Math.min(...prices), max = Math.max(...prices);
     const w = { cost: 0.3, flex: 0.2, effort: 0.2, group: 0.1, value: 0.2 };
     if (prefs.planning === "package") { w.effort += 0.2; w.flex -= 0.1; w.cost -= 0.1; }
     if (prefs.planning === "diy") { w.flex += 0.15; w.effort -= 0.15; }
     if (prefs.comfort === "premium") { w.cost -= 0.15; w.effort += 0.15; }
     const scored = options.map(o => {
       const costScore = max === min ? 100 : 100 - ((o.pricePerPerson - min) / (max - min)) * 100;
       const flex = o.flexibilityScore, effort = o.planningEffortScore;
       const planningScore = prefs.planning === "diy" ? 100 - effort * 0.4 : effort;
       const groupScore = o.self ? Math.min(100, 50 + prefs.travelers * 10) : 70; /* shared costs favour DIY as groups grow */
       const valueScore = (o.activitiesIncluded || 0) * 8 + (o.accommodationIncluded ? 20 : 0) - o.pricePerPerson / 600 + 50;
       const total = w.cost * costScore + w.flex * flex + w.effort * planningScore + w.group * groupScore + w.value * Math.max(0, Math.min(100, valueScore));
       const over = prefs.budget && o.pricePerPerson > prefs.budget ? 15 : 0;
       return { ...o, scores: { costScore, flex, planningScore, groupScore, valueScore }, total: Math.round(total - over) };
     }).sort((a, b) => b.total - a.total);
     const top = scored[0], reasons = [];
     if (top.pricePerPerson === min) reasons.push("Lowest cost per person");
     if (top.flexibilityScore >= 80) reasons.push("High flexibility");
     if (top.self && prefs.travelers >= 3) reasons.push(`A group of ${prefs.travelers} makes self-planning efficient`);
     if (prefs.budget && top.pricePerPerson <= prefs.budget) reasons.push("Within your budget");
     if (top.planningEffortScore >= 90) reasons.push("Little planning effort");
     return { scored, top, reasons };
   }
   
   const IMG = { Adventure: "photo-1506905925346-21bda4d32df4", Beach: "photo-1507525428034-b723cf961d3e", "Road Trip": "photo-1469854523086-cc02fe5d8800", Trekking: "photo-1464822759023-fed622ff2c3b", Cultural: "photo-1548013146-72479768bada", Relaxation: "photo-1476514525535-07fb3b4ae5f1" };
   export const imageFor = (t, w = 900) => t.imageUrl || `https://images.unsplash.com/${IMG[t.tripType] || IMG.Trekking}?w=${w}&q=70`;