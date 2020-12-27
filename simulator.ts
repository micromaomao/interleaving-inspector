(self as any).MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    if (label === 'typescript' || label === 'javascript') {
      return './ts.worker.js';
    }
    return './editor.worker.js';
  },
};


async function init() {
  if (document.readyState != "complete") {
    return;
  }
  document.removeEventListener("readystatechange", init);

  let input_nb_threads = document.getElementById("nb-threads") as HTMLInputElement;
  let threads_container = document.getElementById("threads-container");
  let prelude = document.querySelector("#prelude-container > .editor") as HTMLElement;
  let epilogue = document.querySelector("#epilogue-container > .editor") as HTMLElement;
  let run = document.getElementById("run") as HTMLButtonElement;
  let result = document.getElementById("result");
  let monaco = await import("monaco-editor");
  let app = new App(monaco, input_nb_threads, threads_container, prelude, epilogue, run, result);

  document.querySelector(".loading-cover").remove();
}
document.addEventListener("readystatechange", init);
init();

import type * as monaco from "monaco-editor";

class App {
  threads: number = 0;
  threads_container: HTMLElement;
  editors: monaco.editor.IStandaloneCodeEditor[] = [];
  prelude: monaco.editor.IStandaloneCodeEditor;
  epilogue: monaco.editor.IStandaloneCodeEditor;
  result_container: HTMLElement;
  monaco: typeof monaco;

  constructor(_monaco: typeof monaco,
    input_nb_threads: HTMLInputElement,
    threads_container: HTMLElement,
    prelude_container: HTMLElement,
    epilogue_container: HTMLElement,
    run_btn: HTMLButtonElement,
    result: HTMLElement) {
    this.monaco = _monaco;
    this.threads_container = threads_container;
    this.result_container = result;

    this.prelude = this.create_editor(prelude_container);
    this.epilogue = this.create_editor(epilogue_container);

    this.update(parseInt(input_nb_threads.value));
    input_nb_threads.addEventListener("change", evt => {
      let user_input = parseInt(input_nb_threads.value);
      if (user_input <= 10 && user_input >= 1) {
        this.update(user_input);
      }
    });
    run_btn.addEventListener("click", evt => this.run());

    window.addEventListener("resize", evt => this.resize());
    this.resize();

    this.load_init_data();
  }

  load_init_data() {
    this.prelude.setValue("let x = 1, y = 2;\n");
    this.epilogue.setValue("return [x, y];\n");
    if (this.editors.length > 0) {
      this.editors[0].setValue("// One line is one \"instruction\". Multiline if/for/while not supported.\n// x += y\nlet tmp0 = x;\nlet tmp1 = y;\ntmp0 += tmp1;\nx = tmp0;\n");
      if (this.editors.length > 1) {
        this.editors[1].setValue("y = 3;\n");
      }
    }
  }

  update(new_thread_count: number) {
    let old_thread_count = this.threads;
    let thread_containers = new Array(...this.threads_container.querySelectorAll(".thread"));
    if (old_thread_count != thread_containers.length || this.editors.length != thread_containers.length) {
      throw new Error("assert");
    }
    if (old_thread_count < new_thread_count) {
      for (let i = old_thread_count; i < new_thread_count; i++) {
        let ele = document.createElement("div");
        ele.classList.add("thread");
        let name = document.createElement("div");
        name.classList.add("name");
        name.textContent = `Thread ${i}`;
        ele.appendChild(name);
        let editor_contain = document.createElement("div");
        editor_contain.classList.add("editor");
        ele.appendChild(editor_contain);
        this.threads_container.appendChild(ele);
        let editor = this.create_editor(editor_contain);
        this.editors.push(editor);
      }
    } else if (old_thread_count > new_thread_count) {
      for (let i = new_thread_count; i < old_thread_count; i++) {
        thread_containers[i].remove();
        this.editors[i].dispose();
      }
      this.editors.splice(new_thread_count, old_thread_count - new_thread_count);
    }

    this.threads = new_thread_count;
  }

  resize() {
    for (let editor of this.editors) {
      editor.layout();
    }
    this.prelude.layout();
    this.epilogue.layout();
  }

  create_editor(editor_container: HTMLElement): monaco.editor.IStandaloneCodeEditor {
    return this.monaco.editor.create(editor_container, {
      language: "javascript",
      minimap: { enabled: false }
    });
  }

  run() {
    try {
      let r = do_interleavings(this.prelude.getValue(), this.editors.map(x => x.getValue()), this.epilogue.getValue());
      this.show_interleavings(r);
    } catch (e) {
      this.result_container.innerHTML = "";
      let err = document.createElement("div");
      err.classList.add("err");
      err.textContent = e.toString();
      this.result_container.appendChild(err);
    }
  }

  show_interleavings(result: Map<string, number>) {
    let arr: {k: string, v: number}[] = [];
    let total = 0;
    for (let k of result.keys()) {
      let o = {k, v: result.get(k)};
      total += o.v;
      arr.push(o);
    }
    arr.sort((a, b) => b.v - a.v);

    this.result_container.innerHTML = "";
    let table = document.createElement("table");
    table.classList.add("result-table");
    let tbody = document.createElement("tbody");
    table.appendChild(tbody);
    tbody.innerHTML = `<tr><td class="res">Result</td><td class="freq">Frequency / Total</td></tr>`
    for (let row of arr) {
      let tr = document.createElement("tr");
      let a = document.createElement("td");
      let b = document.createElement("td");
      a.textContent = row.k;
      b.textContent = `${row.v} / ${total}`;
      a.classList.add("res");
      b.classList.add("freq");
      tr.appendChild(a);
      tr.appendChild(b);
      tbody.appendChild(tr);
    }
    this.result_container.appendChild(table);
  }
}

function factorial(x: number): number {
  if (x == 0 || x == 1) return 1;
  let result = 1;
  for (let i = 2; i <= x; i++) {
    result *= x;
    if (!Number.isSafeInteger(result)) {
      throw new Error("Factorial too large.");
    }
  }
  return result;
}

function sum(x: number[]): number {
  let s = 0;
  for (let nb of x) {
    s += nb;
  }
  return s;
}

function product(x: number[]): number {
  let s = 0;
  for (let nb of x) {
    s *= nb;
  }
  return s;
}

function do_interleavings(prelude: string, threads: string[], epilogue: string): Map<string, number> {
  let t = threads.map(x => split_lines(x));
  let interleavings = generate_interleavings(t);
  let functions = interleavings.map(i => {
    let source = `${prelude}\n${i.join("\n")}\n${epilogue}`;
    return new Function(source);
  });
  let results: Map<string, number> = new Map();
  for (let f of functions) {
    let r = JSON.stringify(f());
    if (results.has(r)) {
      results.set(r, results.get(r) + 1);
    } else {
      results.set(r, 1);
    }
  }
  return results;

  function split_lines(code: string): string[] {
    let lines = code.replace(/\/\*.+\*\//g, "").split("\n").filter(x => {
      let trimed = x.trim();
      return trimed != "" && !trimed.startsWith("//");
    });
    return lines;
  }

  function generate_interleavings(codes: string[][]): string[][] {
    /**
     * This function generates the interleavings for the suffixes of each
     * thread in "codes". Each suffix is specified by a length value.
     *
     * For optimization, the result is returned in reverse. i.e. a return value
     * of [["b", "a"]] means that there are one way to interleave: ["a", "b"].
     */
    function process_suffix(lengths: number[]): string[][] {
      let choices = [];
      for (let i = 0; i < lengths.length; i++) {
        if (lengths[i] != 0) {
          choices.push(i);
        }
      }
      if (choices.length == 0) {
        // input is [0,0,0,..,0]
        return [[]];
      }
      let result = [];
      for (let choice of choices) {
        let this_line = codes[choice][codes[choice].length - lengths[choice]];
        lengths[choice] -= 1;
        let rest_result = process_suffix(lengths);
        lengths[choice] += 1;
        for (let r of rest_result) {
          r.push(this_line);
          result.push(r);
        }
      }
      return result;
    }

    let res = process_suffix(codes.map(x => x.length)).map(x => x.reverse());
    return res;
  }
}
