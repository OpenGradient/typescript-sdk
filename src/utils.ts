import { InferenceMode, OpenGradientError, RawModelInput, DecodedInferencePayload } from "./types";

export function convertToModelInput(input: RawModelInput): any {
  const numbers = [];
  const strings = [];

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      strings.push({
        name: key,
        values: [value],
      });
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      strings.push({
        name: key,
        values: value as string[],
      });
    } else if (typeof value === "number") {
      // Handle single number
      numbers.push({
        name: key,
        values: [{ value: value, decimals: 0 }],
        shape: [1],
      });
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;

      if (typeof value[0] === "number") {
        // Handle 1D number array
        numbers.push({
          name: key,
          values: value.map((n) => ({ value: n, decimals: 0 })),
          shape: [value.length],
        });
      } else if (Array.isArray(value[0])) {
        // Handle 2D number array
        const rows = value.length;
        const cols = (value[0] as number[]).length;
        const flatValues = [];

        for (const row of value) {
          for (const col of row as number[]) {
            flatValues.push({ value: col, decimals: 0 });
          }
        }

        numbers.push({
          name: key,
          values: flatValues,
          shape: [rows, cols],
        });
      }
    }
  }

  return {
    numbers,
    strings,
  };
}

export function convertToModelOutput(eventData: any): RawModelInput {
  const outputDict: RawModelInput = {};
  
  try {
    const output = eventData?.output || eventData;
    if (Array.isArray(output) || (output && output[0] && output[1])) {
      const numberTensors = Array.isArray(output[0]) ? output[0] : [];
      for (const tensor of numberTensors || []) {
        try {
          if (Array.isArray(tensor) && tensor.length >= 3) {
            const name = tensor[0];
            const valuesArray = tensor[1];
            const shape = Array.isArray(tensor[2]) ? tensor[2].map(Number) : [];
            
            const values = Array.isArray(valuesArray) 
              ? valuesArray.map(v => Array.isArray(v) ? Number(v[0]) : Number(v)) 
              : [];
            
            if (shape.length === 1) {
              outputDict[name] = values;
            } else if (shape.length === 2) {
              const rows = shape[0];
              const cols = shape[1];
              const matrix: number[][] = [];
              
              for (let i = 0; i < rows; i++) {
                const row: number[] = [];
                for (let j = 0; j < cols; j++) {
                  row.push(values[i * cols + j]);
                }
                matrix.push(row);
              }
              
              outputDict[name] = matrix;
            }
          }
        } catch (tensorError) {
          console.error("Error processing number tensor:", tensorError);
        }
      }
      
      // Handle string tensors
      const stringTensors = Array.isArray(output[1]) ? output[1] : [];
      for (const tensor of stringTensors || []) {
        try {
          if (Array.isArray(tensor) && tensor.length >= 2) {
            const name = tensor[0];
            const values = tensor[1];
            
            if (Array.isArray(values)) {
              outputDict[name] = values.length === 1 ? values[0] : values;
            }
          }
        } catch (tensorError) {
          console.error("Error processing string tensor:", tensorError);
        }
      }
      
      return outputDict;
    }
    
    if (output && typeof output === 'object') {
      // Handle number tensors
      for (const tensor of output.numbers || []) {
        try {
          if (tensor && typeof tensor === 'object') {
            const name = tensor.name;
            const shape = tensor.shape || [];
            const values: number[] = [];
            
            console.log(`Processing number tensor "${name}":`, {
              shape,
              valuesCount: tensor.values?.length || 0
            });
            
            for (const v of tensor.values || []) {
              if (v && typeof v === 'object') {
                const value = parseInt(String(v.value));
                const decimals = parseInt(String(v.decimals));
                values.push(value / Math.pow(10, decimals));
              } else {
                console.warn(`Unexpected number type: ${typeof v}, value:`, v);
              }
            }
            
            outputDict[name] = reshapeArray(values, shape);
          }
        } catch (tensorError) {
          console.error("Error processing number tensor:", tensorError);
        }
      }
      
      // Parse strings
      for (const tensor of output.strings || []) {
        try {
          if (tensor && typeof tensor === 'object') {
            const name = tensor.name;
            const shape = tensor.shape || [];
            const values = tensor.values || [];
            
            outputDict[name] = reshapeArray(values, shape);
          }
        } catch (tensorError) {
          console.error("Error processing string tensor:", tensorError);
        }
      }
      
      // Parse JSON objects
      for (const tensor of output.jsons || []) {
        try {
          if (tensor && typeof tensor === 'object') {
            const name = tensor.name;
            const value = tensor.value;
            
            try {
              const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
              outputDict[name] = parsedValue;
            } catch (parseError) {
              console.warn(`Failed to parse JSON value for ${name}: ${parseError}`);
              outputDict[name] = value;
            }
          }
        } catch (tensorError) {
          console.error("Error processing JSON tensor:", tensorError);
        }
      }
    }
    
    return outputDict;
  } catch (error) {
    console.error("Error in convertToModelOutput:", error);
    return outputDict;
  }
}

function reshapeArray(array: any[], shape: number[]): any {
  if (!shape || shape.length === 0) {
    return array;
  }
  
  if (shape.length === 1) {
    return array.slice(0, shape[0]); 
  }
  
  const result = [];
  const lastDimSize = shape[shape.length - 1];
  const subShape = shape.slice(1);
  
  for (let i = 0; i < shape[0]; i++) {
    if (shape.length === 2) {
      const start = i * lastDimSize;
      const row = array.slice(start, start + lastDimSize);
      result.push(row);
    } else {
      const subArraySize = array.length / shape[0];
      const subArray = array.slice(i * subArraySize, (i + 1) * subArraySize);
      result.push(reshapeArray(subArray, subShape));
    }
  }
  
  return result;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export async function getInferenceResultFromNode(
  apiUrl: string,
  inferenceId: string,
  inferenceMode: InferenceMode
): Promise<any | null> {
  let response: Response | undefined;
  try {
      const encodedId = encodeURIComponent(inferenceId);
      const url = `${apiUrl}/artela-network/artela-rollkit/inference/tx/${encodedId}`;

      response = await fetch(url);
      if (!response.ok) { 
          let errorBody = '';
          try {
              errorBody = await response.text(); 
          } catch (e) {
          }
          const errorMessage = `Failed to get inference result: HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ''}`;
          console.error(errorMessage); 
          throw new OpenGradientError(errorMessage);
      }
      
      const resp = await response.json();
      const inferenceResults = resp.inference_results; 
      if (inferenceResults && inferenceResults.length > 0) {
          const encodedResult = inferenceResults[0];
          let decodedString: string;
          let output: DecodedInferencePayload;

          try {
              // base64 decode
              const decodedBytes = Buffer.from(encodedResult, 'base64');
              decodedString = decodedBytes.toString('utf-8');
          } catch (decodeError: any) {
              console.error(`Base64 decoding failed: ${decodeError.message}`, decodeError);
              throw new OpenGradientError(`Failed to decode base64 inference result: ${decodeError.message}`);
          }

          try {
              output = JSON.parse(decodedString) as DecodedInferencePayload;
          } catch (parseError: any) {
              console.error(`JSON parsing failed for decoded string: ${parseError.message}`, parseError);
              throw new OpenGradientError(`Failed to parse decoded inference result JSON: ${parseError.message}`);
          }

          const inferenceOutput = output?.InferenceResult;
          if (!inferenceOutput) {
               throw new OpenGradientError("Missing InferenceResult in inference output");
          }

          switch (inferenceMode) {
              case InferenceMode.VANILLA:
                  if (!inferenceOutput.VanillaResult) {
                      throw new OpenGradientError("Missing VanillaResult in inference output");
                  }
                  if (inferenceOutput.VanillaResult.model_output === undefined) { // Check specifically for undefined/missing
                      throw new OpenGradientError("Missing model_output in VanillaResult");
                  }
                  return {
                      output: inferenceOutput.VanillaResult.model_output
                  };

              case InferenceMode.TEE:
                  if (!inferenceOutput.TeeNodeResult) {
                      throw new OpenGradientError("Missing TeeNodeResult in inference output");
                  }
                  if (!inferenceOutput.TeeNodeResult.Response) {
                      throw new OpenGradientError("Missing Response in TeeNodeResult");
                  }
                   if (!inferenceOutput.TeeNodeResult.Response.VanillaResponse) {
                      throw new OpenGradientError("Missing VanillaResponse in TeeNodeResult Response");
                  }
                  if (inferenceOutput.TeeNodeResult.Response.VanillaResponse.model_output === undefined) {
                      throw new OpenGradientError("Missing model_output in VanillaResponse");
                  }
                  return {
                      output: inferenceOutput.TeeNodeResult.Response.VanillaResponse.model_output
                  };

              case InferenceMode.ZKML:
                   if (!inferenceOutput.ZkmlResult) {
                      throw new OpenGradientError("Missing ZkmlResult in inference output");
                  }
                   if (inferenceOutput.ZkmlResult.model_output === undefined) {
                      throw new OpenGradientError("Missing model_output in ZkmlResult");
                  }
                  return {
                      output: inferenceOutput.ZkmlResult.model_output
                  };

              default:
                  console.error(`Invalid inference mode encountered: ${inferenceMode}`);
                  throw new OpenGradientError(`Invalid inference mode: ${inferenceMode}`);
          }
      } else {
          return null;
      }

  } catch (error: any) {
      if (error instanceof OpenGradientError) {
          throw error;
      } else {  
          // Wrap other errors (like fetch network errors) in OpenGradientError
          console.error(`Unexpected error when getting inference result: ${error.message}`, error);
          throw new OpenGradientError(`Failed to get inference result: ${error.message || String(error)}`);
      }
  }
}
