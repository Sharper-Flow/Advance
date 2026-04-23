import { z } from "zod";

const schema1 = z.record(z.number());
const schema2 = z.record(z.string(), z.number());

const data = { proposal: 300000, discovery: 600000 };

console.log("schema1:", JSON.stringify(schema1.safeParse(data)));
console.log("schema2:", JSON.stringify(schema2.safeParse(data)));
