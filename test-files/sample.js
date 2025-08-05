// Sample JavaScript for testing file upload
class FileProcessor {
  constructor() {
    this.supportedTypes = ['image', 'document', 'code'];
  }
  
  async process(files) {
    const results = [];
    
    for (const file of files) {
      try {
        const processed = await this.processIndividual(file);
        results.push(processed);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
      }
    }
    
    return results;
  }
  
  async processIndividual(file) {
    // Validate file
    if (!this.isSupported(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }
    
    // Process based on type
    return {
      name: file.name,
      type: file.type,
      size: file.size,
      processed: true,
      timestamp: new Date().toISOString()
    };
  }
  
  isSupported(type) {
    return this.supportedTypes.includes(type);
  }
}

const processor = new FileProcessor();
export default processor;
