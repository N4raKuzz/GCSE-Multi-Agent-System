import os
import io
import argparse
from dotenv import load_dotenv
from docling.document_converter import DocumentConverter
from unstructured.partition.auto import partition
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_neo4j import Neo4jVector, Neo4jGraph
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing import List

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# Initialize Gemini Model & Embeddings
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0, api_key=GOOGLE_API_KEY)
embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")

class Relationship(BaseModel):
    source: str = Field(description="The subject entity")
    target: str = Field(description="The object entity")
    relation: str = Field(description="The relationship")

class Entity(BaseModel):
    name: str = Field(description="Name of the concept")
    type: str = Field(description="Category")

class KnowledgeGraph(BaseModel):
    entities: List[Entity]
    relationships: List[Relationship]

class IngestionPipeline():

    def __init__(self):

        self.graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)

        # Extraction Chain
        system_prompt = """
        You are an expert Librarian. Your task is to extract a Knowledge Graph from the given text materials.
        The number of PAGES and the academic SYSTEMS included in the input texts may vary significantly. You need to find a balance in terms of the quantity of concepts. 

        Follow these rules:
        1. Identify key 'Entity's. Usually a Scientific Concepts, Laws, Formulas, or Historical figures.
        2. Identify 'Relationship's between them. Entity (Concept A) -- Relationship -> Entity (Concept B)
        3. Focus on pedagogical links: 
            3.1 Causal Relationship:
            - 'PREREQUISITE_FOR' : Concept A is needed to understand Concept B / Concept A is (one of the) condition of Concept B        
            - 'OUTCOME' : The fact that Concept A directly lead to the occurance of Concept B. 
            - 'PURPOSE_OF' : Concept A is the desired outcome that Concpet B is intended to achieve
            3.2 Compositional Relationships
            - 'PART_OF' : Concept A is the component of Concept B.
            - 'SUBTYPE' : Concept A is a more specific instance of Concept B.
            - 'SUPERTYPE' : Concept A is a broader category of Concept B.
            3.3 Temporal Relationship
            - 'FOLLOWS' :  Concept A must occur or is true after Concept B in a defined order.
            - 'SIMULTANEOUSLY' : Concept A and Concept B occur or are true at the same time.
        4. Check if the Entity-Relationship you extract is a KNOWLEDGE. Good example : Mitochondria PART_OF Cell; Bad example : Math PREREQUISITE_FOR Further Math

        Output must be in strict JSON format.
        """

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Extract the graph from this textbook section: {text}")
        ])

        self.extraction_chain = prompt | llm.with_structured_output(KnowledgeGraph)

    def parse_pdf(self, file):
        
        try:
            # Read the uploaded file into a BytesIO stream
            file_content = file.read()
            file_stream = io.BytesIO(file_content)
            file_stream.seek(0)

            # 'strategy="fast"' -> text-based PDFs. 
            # 'strategy="hi_res"' -> OCR required for scanned images.
            elements = partition(file=file_stream, strategy="auto")

            pages = set()
            for el in elements:
                p = el.metadata.page_number
                if p: pages.add(p)
                
            print(f"Total elements found: {len(elements)}")
            print(f"Unique pages detected: {sorted(list(pages))}")

            # Join the elements into a single string
            parsed_text = "\n\n".join([str(el) for el in elements])

            # converter = DocumentConverter()
            # parsed_text = converter.convert(file).document.export_to_markdown()

            with open("./RAG/parsed_pdf.txt", "w", encoding="utf-8") as f:
                f.write(parsed_text)

            return parsed_text

        except Exception as e:
            return f"An error occurred during parsing: {str(e)}"

    def ingest_with_gemini(self, input_materials):

        markdown_text = self.parse_pdf(input_materials)
        graph_data = self.extraction_chain.invoke({"text": markdown_text})

        Neo4jVector.from_texts(
            [markdown_text], 
            embeddings, 
            url=NEO4J_URI, 
            username=NEO4J_USERNAME, 
            password=NEO4J_PASSWORD,
            node_label="Chunk"
        )

        for entity in graph_data.entities:
            # Use MERGE to ensure uniqueness based on the concept name
            entity_query = """
            MERGE (e:Concept {name: $name})
            SET e.type = $type
            """
            self.graph.query(entity_query, params={
                "name": entity.name, 
                "type": entity.type
            })
        
        # Insert Relationships
        for rel in graph_data.relationships:
            # This query matches the two existing nodes and creates a relationship between them
            rel_query = """
            MATCH (source:Concept {name: $source_name})
            MATCH (target:Concept {name: $target_name})
            MERGE (source)-[r:RELATED_TO {type: $rel_type}]->(target)
            """
            self.graph.query(rel_query, params={
                "source_name": rel.source,
                "target_name": rel.target,
                "rel_type": rel.relation
            })
            
        print(f"Successfully ingested {len(graph_data.entities)} entities and {len(graph_data.relationships)} relationships.")

        return graph_data
    
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "pdf_path", type=str
    )

    pdf_path = parser.parse_args().pdf_path

    pipeline = IngestionPipeline()
    print(f"--- Starting Ingestion for {pdf_path} ---")
    
    try:
        with open(pdf_path, "rb") as f:
            # The pipeline handles parsing, vectorizing, and graph mapping
            result = pipeline.ingest_with_gemini(f)
            print(f"Success: {result}")
            
    except FileNotFoundError:
        print(f"Error: The file {pdf_path} was not found.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

    print("--- Knowledge Base Update Complete ---")

if __name__ == "__main__":
    main()
    
