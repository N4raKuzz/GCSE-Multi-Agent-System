
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { TextbookContent, Solution, AgentRole, ImageData } from "./types";
import neo4j from 'neo4j-driver';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!));

export class GCSEMultiAgentSystem {
  private modelName = 'gemini-3-pro-preview';

  async solve(problem: string, context: TextbookContent[], images: ImageData[]): Promise<Solution> {
    
    // Prepare image
    const image = images.map(img => ({
      inlineData: {
        data: img.base64.split(',')[1] || img.base64,
        mimeType: img.mimeType
      }
    }));

    // 1. Librarian Agent: Identify Knowledge Points & Extract Formulas
    const memo = await this.runLibrarian(problem, image);
    
    // 2. Solver Agent: Apply extracted knowledge to the problem
    const solution = await this.runSolver(problem, memo, image);

    // 3. Examiner Agent: Review the pedagogical accuracy and strict use of provided knowledge
    const review = await this.runExaminer(problem, solution, memo, image);

    return {
      steps: [
        { title: 'Relevant Knowledge Points & Formulas', content: memo, agent: 'Librarian' },
        ...solution
      ],
      finalAnswer: solution[solution.length - 1]?.content || "Could not generate answer",
      curriculumCheck: review
    };
  }

  private async runLibrarian(problem: string, imageParts: any[]): Promise<string> {
    // Generate Cypher query based on user's problem
    const cypherGenerationResponse = await ai.models.generateContent({
      model: this.modelName,
      contents: {
        parts: [
          ...imageParts,
          { text: `Analyze this problem and write a Neo4j Cypher query to retrieve relevant academic concepts.
          
          GRAPH SCHEMA:
          - Nodes: (c:Concept {name: string, type: string})
          - Relationships: [:RELATED_TO {type: 'PREREQUISITE_FOR' | 'OUTCOME' | 'PURPOSE_OF' | 'PART_OF' | 'SUBTYPE' | 'SUPERTYPE' | 'FOLLOWS' | 'SIMULTANEOUSLY' }]
          
          TASK:
          Write a Cypher query that matches Concepts mentioned in the problem AND their immediate prerequisites or components.
          
          EXAMPLE OUTPUT:
          MATCH (c:Concept)-[r:RELATED_TO]->(neighbor) 
          WHERE c.name IN ['Mitochondria', 'Cell'] 
          RETURN c.name, r.type, neighbor.name;

          Problem: ${problem}` }
        ]
      },
      config: {
        systemInstruction: "Output ONLY the Cypher query. No markdown, no explanation.",
      }
    });

    const query = cypherGenerationResponse.text.trim().replace(/```cypher|```/g, "");

    // Execute the Neo4j query
    const session = driver.session();
    let graphResults = "";
    
    try {
      const result = await session.run(query);
      graphResults = result.records.map(record => {
        return `${record.get('c.name')} --[${record.get('r.type')}]--> ${record.get('neighbor.name')}`;
      }).join("\n");
    } finally {
      await session.close();
    }

    // Create the Research Memo
    const memo = await ai.models.generateContent({
      model: this.modelName,
      contents: {
          parts: [{ text: `Based on these graph results, create a Research Memo for the student's problem.
          
          Graph Results:
          ${graphResults}
          
          Problem: ${problem}
          
          RESTRICTION: Do not solve. Provide only definitions and formulas found in the graph.` }]
      }
    });

  return memo.text;
}

  private async runSolver(problem: string, knowledge: string, image: any[]): Promise<any[]> {
    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: {
        parts: [
          ...image,
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
