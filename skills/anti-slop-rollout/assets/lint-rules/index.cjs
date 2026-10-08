// Project lint rules, loaded by oxlint (`jsPlugins`) or ESLint (flat config `plugins`).
// Each rule encodes an incident. Its message says what failed, why (the incident), and what to do instead.

const SERVICE_FILE = /(?:^|\/)services\//;
const ROUNDING = new Set(["round", "floor", "ceil", "trunc"]);

const noRoundingInServices = {
  meta: {
    type: "problem",
    docs: {
      description: "Services return exact values; formatters round",
      url: "https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review#5-turn-recurring-mistakes-into-linter-rules",
    },
    messages: {
      rounding:
        "Services compute, formatters round. Rounding twice moves the value off its true one: Math.round(h * 10) / 10 turned a 26h15m total into 26h18m. Return the exact value and round in the formatter.",
    },
    schema: [],
  },
  create(context) {
    if (!SERVICE_FILE.test(context.filename ?? context.getFilename())) return {};

    return {
      CallExpression(node) {
        const { callee } = node;

        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;

        const name = callee.property.name;
        const mathRounding =
          callee.object.type === "Identifier" && callee.object.name === "Math" && ROUNDING.has(name);

        if (mathRounding || name === "toFixed") context.report({ node, messageId: "rounding" });
      },
    };
  },
};

module.exports = {
  meta: { name: "local" },
  rules: {
    "no-rounding-in-services": noRoundingInServices,
  },
};
