const {onCall} = require("firebase-functions/v2/https");
const {GoogleGenerativeAI} = require("@google/generative-ai");

// Replace with your actual key from Google AI Studio
const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");

exports.getAIAdvice = onCall(async (request) => {
  if (!request.auth) {
    return {answer: "Please log in to talk to the AI coach."};
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "You are the FocusFlow AI Coach. " +
                "Help users improve routines. Be concise.",
    });

    const result = await model.generateContent(request.data.text);
    const response = result.response.text();

    return {answer: response};
  } catch (error) {
    console.error("AI Error:", error);
    return {answer: "I'm having trouble thinking. Try again!"};
  }
});
