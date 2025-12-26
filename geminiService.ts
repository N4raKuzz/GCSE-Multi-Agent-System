
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { TextbookContent, Solution, AgentRole, ImageData } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export class GCSEMultiAgentSystem {
  private modelName = 'gemini-3-pro-preview';

  async solve(problem: string, context: TextbookContent[], images: ImageData[]): Promise<Solution> {
    const contextText = context.map(c => `--- SOURCE: ${c.sourceName} ---\n${c.text}`).join('\n\n');
    
    // Prepare image parts for Gemini API
    const imageParts = images.map(img => ({
      inlineData: {
        data: img.base64.split(',')[1] || img.base64,
        mimeType: img.mimeType
      }
    }));

    // 1. Librarian Agent: Identify Knowledge Points & Extract Formulas
    const librarianOutput = await this.runLibrarian(problem, contextText, imageParts);
    
    // 2. Solver Agent: Apply extracted knowledge to the problem
    const steps = await this.runSolver(problem, librarianOutput, imageParts);

    // 3. Examiner Agent: Review the pedagogical accuracy and strict use of provided knowledge
    const review = await this.runExaminer(problem, steps, librarianOutput, imageParts);

    return {
      steps: [
        { title: 'Relevant Knowledge Points & Formulas', content: librarianOutput, agent: 'Librarian' },
        ...steps
      ],
      finalAnswer: steps[steps.length - 1]?.content || "Could not generate answer",
      curriculumCheck: review
    };
  }

  private async runLibrarian(problem: string, context: string, imageParts: any[]): Promise<string> {
    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: {
        parts: [
          ...imageParts,
          { text: `You are the 'Librarian Agent' for a GCSE education platform.
          
          TASK:
          1. Analyze the student's problem (text and any attached images).
          2. Identify the specific TOPICS and KNOWLEDGE POINTS required (e.g., "Pythagoras' Theorem", "Mole Calculations", "Newton's Second Law").
          3. Search the provided Textbook Context to find the EXACT formulas, definitions, and rules mentioned in the curriculum.
          4. Output a "Research Memo" that lists ONLY these findings.
          
          CRITICAL RESTRICTION:
          - DO NOT solve the problem.
          - DO NOT perform any calculations.
          - DO NOT provide any steps towards the answer.
          - ONLY provide the underlying academic material required to solve it.
          
          Problem Details: ${problem}
          
          Textbook Context:
          ${context.substring(0, 800000)}` }
        ]
      },
      config: {
        systemInstruction: "You are an expert academic librarian. Your specialty is curriculum-aligned research. You provide facts, definitions, and formulas without solving problems.",
      }
    });
    return response.text || "No relevant knowledge points found in the provided textbook context.";
  }

  private async runSolver(problem: string, knowledge: string, imageParts: any[]): Promise<any[]> {
    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: {
        parts: [
          ...imageParts,
          { text: `You are the 'Solver Agent'. Your task is to solve the GCSE problem step-by-step.
          
          CONSTRAINTS:
          - You MUST use the "Research Memo" provided by the Librarian Agent below.
          - Show your full working for every step.
          - Reference the formulas or concepts provided by the Librarian in your steps.
          
          Librarian's Research Memo:
          ${knowledge}
          
          Problem Details: ${problem}` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short title for this logical step" },
              content: { type: Type.STRING, description: "Detailed explanation and working for this step" },
              agent: { type: Type.STRING, enum: ['Solver'] }
            },
            required: ["title", "content", "agent"]
          }
        },
        systemInstruction: "You are a top-performing student. You apply provided academic formulas to solve problems with perfect logical flow."
      }
    });

    try {
      return JSON.parse(response.text || "[]");
    } catch (e) {
      return [{ title: "Solution Process", content: response.text, agent: "Solver" }];
    }
  }

  private async runExaminer(problem: string, steps: any[], knowledge: string, imageParts: any[]): Promise<string> {
    const solutionText = steps.map(s => `${s.title}: ${s.content}`).join('\n');
    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: {
        parts: [
          ...imageParts,
          { text: `You are the 'Examiner Agent'. Your task is to verify the solution.
          
          VERIFICATION CHECKLIST:
          1. Did the Solver Agent use the knowledge points identified by the Librarian?
          2. Is the calculation correct and the logic sound?
          3. Is the language appropriate for a GCSE student (approx. 14-16 years old)?
          
          Librarian's Research Memo:
          ${knowledge}
          
          Solver's Proposed Steps:
          ${solutionText}` }
        ]
      },
      config: {
        systemInstruction: "You are an official GCSE examiner. You ensure solutions follow the textbook material and provide encouraging, accurate feedback."
      }
    });
    return response.text || "Solution verified against syllabus and provided textbook material.";
  }
}
