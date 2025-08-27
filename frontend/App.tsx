import React, { useState } from "react";
import { Button, Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadImage } from "./src/api/jobs";

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const upload = async () => {
    if (!image) return;
    try {
      const token = "YOUR_JWT_TOKEN_HERE"; // replace or fetch from login
      const res = await uploadImage(token, image);
      setStatus(`Job queued: ${res.job_id}`);
    } catch (err: any) {
      console.error(err);
      setStatus("Upload failed");
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Button title="Pick an image" onPress={pickImage} />
      {image && (
        <Image source={{ uri: image }} style={{ width: 200, height: 200 }} />
      )}
      <Button title="Upload" onPress={upload} disabled={!image} />
      <Text>{status}</Text>
    </View>
  );
}
