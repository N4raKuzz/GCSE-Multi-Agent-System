
export const uploadFileForIngestion = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('http://localhost:8000/ingest', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Ingestion failed');
    
    return await response.json();
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
};