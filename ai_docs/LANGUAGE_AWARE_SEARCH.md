1. High-level concept

You’ll have one generic symbol-search tool exposed to MCP, plus language presets.

We ONLY need it for these languages:
Java

Python

JavaScript / TypeScript

C#

No language server, just ctags + ripgrep + some smart filters.


tool search_symbols(
  workspace_id: string,
  params: {
    language: "java" | "python" | "javascript" | "typescript" | "csharp";
    name: string;                    // search term, e.g. "UserService"
    match?: "exact" | "prefix" | "substring" | "regex";
    kinds?: string[];                // logical kinds: ["class", "method", "variable", "function", "property", ...]
    scope?: {
      in_class?: string;             // e.g. "UserService"
      in_namespace?: string;         // C# namespace / Java package
      in_module?: string;            // Python module
    };
    limit?: number;                  // default 100
  }
) -> {
  symbols: SymbolResult[];
}

Where SymbolResult is roughly:
type SymbolResult = {
  name: string;
  language: string; // one of the above
  kind: string;     // normalized, e.g. "class" | "method" | "field" | ...
  file: string;
  line: number;
  column?: number;
  containerName?: string;   // class / module / namespace name
  signature?: string;       // if available from tags
};

The LLM uses the same tool for all four languages, just changing language + kinds.

Under the hood you:

Build a symbol index using universal-ctags for each workspace. ctags generates an index of language objects (classes, functions, etc.) for many languages including Java, Python, JavaScript, C#, etc. 
GitHub

Use ripgrep as a fallback / usage search when you just need “find occurrences of this name in this language’s files”. ripgrep is a fast, recursive, gitignore-aware regex search tool, widely used for codebases. 

2. Indexing strategy (shared across languages)
2.1 Build a language-agnostic symbol index

For each workspace:

Run universal-ctags with language filters and rich fields:
ctags \
  --languages=Java,Python,JavaScript,TypeScript,C# \
  --fields=+nKls \
  --extras=+q \
  -R .

--fields=+n → line numbers, K/l/s → kind/name/scope info.
--extras=+q → qualified tags, useful for class::member or class.member forms in C++/Java.
Universal-ctags supports many languages out of the box and is the maintained successor of Exuberant Ctags


Parse the generated tags file into your own JSON index:

For each line, extract:

name

file

line

language

kind (ctags kind letter/name)

scope fields (class, namespace, module) if present.

Universal-ctags defines kinds per language (class, function, variable, etc.), and you can introspect them using ctags --list-kinds-full=<LANG>.

Map (language, ctagsKind) → normalized kind:

Example mapping:

Java: class/interface/enum kinds → "class" | "interface" | "enum", method kinds → "method", field kinds → "field". 

Python: class → "class", function → "function", class member → "method", variable/import kinds → "variable" (or you can drop them to keep noise low, similar to editor setups)

JS/TS: function, class, variable kinds → "function" | "class" | "variable".

C#: class, struct, interface, enum, method, property, field → normalized accordingly. Universal-ctags supports C# as a language and can be configured for these kinds.

Store in memory or a small local DB keyed by (language, normalizedKind, name, scope, file)

3. Language-specific search “profiles”

You can keep the MCP interface generic, but implement per-language behavior inside the server:

3.1 Java search

Entities you care about:

Classes / Interfaces / Enums

Methods

Fields

(Optionally) packages

Universal-ctags can generate tags for Java classes, fields, interfaces, methods, and packages. 
pegasusinfocorp.com
+2
Centennial Software Solutions LLC
+2

Symbol search behavior:

When language = "java", map kinds like:

"class" → ctags Java kinds: class/interface/enum

"method" → Java method kind

"field" → Java field kind

Apply match to the symbol name:

"exact" → name === query

"prefix" → name.startsWith(query)

"substring" → name.toLowerCase().includes(query.toLowerCase())

"regex" → compile query as regex and match symbol name.

Use scope.in_class and scope.in_namespace to filter:

in_class → only methods/fields whose containerName/class field matches.

in_namespace → map to Java package if ctags provides it.

Usage search (optional second tool or flag):

Use ripgrep constrained to **/*.java for occurrences of class/method names:

rg --glob '*.java' 'UserService' src/

This is good for “find all usages”, while ctags is good for “find definition”.

3.2 Python search

Entities:

Modules (files / packages)

Classes

Functions (top-level)

Methods (class members)

(Optionally) variables / attributes

By default, ctags generates tags for Python functions, classes, class members, variables, imports, and files. 
Arch Manual Pages
+2
GitHub
+2

Symbol search behavior:

When language = "python":

"class" → Python class kind.

"function" → module-level function kind.

"method" → class member kind.

"variable" (if you decide to support) → variable kind.

scope.in_module allows filtering by file/module (e.g., 'my_package.my_module' if you derive dotted path from filesystem).

You can also split:

kinds = ["function"] → only module-level functions.

kinds = ["method"] + scope.in_class="User" → methods on class User.

Usage search:

Use rg limited to *.py to find references to a function/method.

rg --glob '*.py' 'def my_function' .
rg --glob '*.py' 'my_function\(' .

3.3 JavaScript / TypeScript search

Entities:

Functions (named / exported)

Classes

Variables: const, let, var, exported bindings

Types/Interfaces/Enums (TS only)

ctags can index JS/TS symbols (functions, variables, classes, etc.), and you can introspect its TypeScript support via --list-kinds=typescript. 
Reddit
+2
Medium
+2

Symbol search behavior:

When language = "javascript":

"function" → JS function kinds.

"class" → JS class kinds.

"variable" → variable kinds (you might restrict to exported or top-level based on tag metadata if available).

When language = "typescript":

"function", "class", "variable" as above.

"interface" → TS interface tags.

"type" → TS type alias tags.

"enum" → TS enum tags.

For variables, you might want to bias toward exported/public things, but initially you can just expose all variable tags and let the LLM filter by file / naming.

Usage search (ripgrep):

Use file globs appropriate for JS/TS:

rg --glob '*.{js,jsx,ts,tsx}' 'UserStore' .


Or file type filters if you configure them.

3.4 C# search

Entities:

Namespaces

Classes / Structs / Interfaces / Enums

Methods

Properties

Fields

(Optionally) Events

Universal-ctags supports C# as a language, and people use it to generate tags for C# code (class, method, etc.), often as a lightweight alternative to OmniSharp. 
GitHub
+3
ctags.sourceforge.net
+3
Reddit
+3

Symbol search behavior:

When language = "csharp":

"namespace" → namespace kinds.

"class" → class kinds.

"struct", "interface", "enum" similarly.

"method" → methods.

"property" → property tags (ctags typically distinguishes them).

"field" → field tags.

scope.in_namespace and scope.in_class are especially useful.

E.g., in_namespace = "MyApp.Services" and kind = ["class"].

Usage search (ripgrep):

Limit search to C# files:

rg --glob '*.{cs,csx}' 'ILogger' .

4. Extra: a small “search profile” table per language

You can bake these into a tiny config so the server knows defaults for each language.

Example internal config:

const LanguageProfiles = {
  java: {
    fileGlobs: ["**/*.java"],
    defaultKinds: ["class", "interface", "enum", "method"],
  },
  python: {
    fileGlobs: ["**/*.py"],
    defaultKinds: ["class", "function", "method"],
  },
  javascript: {
    fileGlobs: ["**/*.js", "**/*.jsx"],
    defaultKinds: ["function", "class", "variable"],
  },
  typescript: {
    fileGlobs: ["**/*.ts", "**/*.tsx"],
    defaultKinds: ["function", "class", "variable", "interface", "type", "enum"],
  },
  csharp: {
    fileGlobs: ["**/*.cs", "**/*.csx"],
    defaultKinds: [
      "namespace",
      "class",
      "struct",
      "interface",
      "enum",
      "method",
      "property",
      "field",
    ],
  },
};


The MCP tool can default kinds from here if the caller just says “language: java, name: UserService”.

5. How this fits into your MCP server

Putting it together:

Indexing service

At startup or via refresh_index, run universal-ctags over the workspace and load tags into a per-language symbol index. 
GitHub
+2
docs.ctags.io
+2

search_symbols tool (generic)

Filters the symbol index by (language, kind(s), name, scope) and returns small, precise symbol hits.

search_text / search_usages tool (existing/other)

Wraps ripgrep with language-specific fileGlobs.

LLM flow examples:

“Find the Java class UserService” → search_symbols(language=java, kinds=["class"], name="UserService").

“Find all Python methods called handle_request” → search_symbols(language=python, kinds=["method"], name="handle_request").

“List all TypeScript interfaces in this project” → search_symbols(language=typescript, kinds=["interface"], name="", match="prefix") (empty name + limit, or a dedicated “list_symbols” variant).

“Find the C# property IsEnabled on FeatureFlags” → search_symbols(language=csharp, kinds=["property"], name="IsEnabled", scope={in_class:"FeatureFlags"}).

This gives you language-optimized symbol search for Java, Python, JS/TS, and C# without ever becoming a language server: just ctags-backed indexes + ripgrep, wrapped in a single clean MCP tool the LLM can drive.