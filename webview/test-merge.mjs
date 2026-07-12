import React from 'react';
import { renderToString } from 'react-dom/server';
import CodeMirrorMerge from 'react-codemirror-merge';

const Original = CodeMirrorMerge.Original;
const Modified = CodeMirrorMerge.Modified;

const App = () => {
  return React.createElement(CodeMirrorMerge, { orientation: 'a-b' },
    React.createElement(Original, { value: 'hello world' }),
    React.createElement(Modified, { value: 'hello there' })
  );
};

const html = renderToString(React.createElement(App));
console.log(html);
