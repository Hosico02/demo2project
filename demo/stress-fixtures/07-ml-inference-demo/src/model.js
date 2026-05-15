const session = await ort.InferenceSession.create('model.onnx');
console.log(session);
