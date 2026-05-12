import React from 'react';
// no tests, no error boundary, hardcoded api url, no .env example
const API = 'https://api.example.com';
export default function App() {
  return <div onClick={() => fetch(API)}>click me</div>;
}
