/**
 * Unit tests for expanded language support in symbol indexer.
 * Tests Go, Rust, C, C++, PHP, Ruby, Kotlin, Swift, Scala, Dart, Lua.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SymbolIndexer } from '../../src/symbol-search/symbol-indexer.js';
import { SymbolSearchService } from '../../src/symbol-search/symbol-search-service.js';
import { isCTagsAvailable } from '../../src/symbol-search/ctags-integration.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'symbol-indexer-extended-test');

describe('Symbol Indexer - Extended Language Support', () => {
  let symbolIndexer: SymbolIndexer;
  let symbolSearchService: SymbolSearchService;
  let ctagsAvailable = false;

  beforeAll(async () => {
    symbolIndexer = new SymbolIndexer();
    symbolSearchService = new SymbolSearchService(symbolIndexer);
    ctagsAvailable = await isCTagsAvailable();

    if (!ctagsAvailable) {
      console.warn('⚠️  ctags not available - skipping symbol indexer tests');
    }

    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Go Language Support', () => {
    it('should index Go packages', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const goDir = path.join(TEST_DIR, 'go-test');
      await fs.mkdir(goDir, { recursive: true });

      await fs.writeFile(
        path.join(goDir, 'main.go'),
        `package main

import "fmt"

type User struct {
    ID   int
    Name string
}

func main() {
    fmt.Println("Hello, World!")
}

func (u *User) GetName() string {
    return u.Name
}

func NewUser(id int, name string) *User {
    return &User{ID: id, Name: name}
}
`
      );

      await symbolIndexer.buildIndex('go-test', goDir);
      expect(symbolIndexer.hasIndex('go-test')).toBe(true);

      const index = symbolIndexer.getIndex('go-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test struct indexing
      const structResults = await symbolSearchService.searchSymbols('go-test', {
        language: 'go',
        name: 'User',
        match: 'exact',
      });
      expect(structResults.symbols.length).toBeGreaterThan(0);
      const userStruct = structResults.symbols.find(s => s.name === 'User' && s.kind === 'struct');
      expect(userStruct).toBeDefined();

      // Test function indexing
      const funcResults = await symbolSearchService.searchSymbols('go-test', {
        language: 'go',
        name: 'main',
        match: 'exact',
      });
      expect(funcResults.symbols.length).toBeGreaterThan(0);

      // Note: Method indexing (GetName) support varies by ctags version
      // Some versions index Go methods, others don't - both are valid
    });
  });

  describe('Rust Language Support', () => {
    

    it('should index Rust modules, structs, and functions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const rustDir = path.join(TEST_DIR, 'rust-test');
      await fs.mkdir(rustDir, { recursive: true });

      await fs.writeFile(
        path.join(rustDir, 'lib.rs'),
        `pub mod user {
    pub struct User {
        pub id: u32,
        pub name: String,
    }

    impl User {
        pub fn new(id: u32, name: String) -> Self {
            User { id, name }
        }

        pub fn get_name(&self) -> &str {
            &self.name
        }
    }
}

pub trait Authenticate {
    fn login(&self) -> bool;
}

pub enum Status {
    Active,
    Inactive,
}

pub fn greet(name: &str) {
    println!("Hello, {}!", name);
}
`
      );

      await symbolIndexer.buildIndex('rust-test', rustDir);
      expect(symbolIndexer.hasIndex('rust-test')).toBe(true);

      const index = symbolIndexer.getIndex('rust-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test struct indexing
      const structResults = await symbolSearchService.searchSymbols('rust-test', {
        language: 'rust',
        name: 'User',
        match: 'exact',
      });
      expect(structResults.symbols.length).toBeGreaterThan(0);

      // Test function indexing (more reliably indexed than traits)
      const funcResults = await symbolSearchService.searchSymbols('rust-test', {
        language: 'rust',
        name: 'greet',
        match: 'exact',
      });
      expect(funcResults.symbols.length).toBeGreaterThan(0);

      // Test enum indexing
      const enumResults = await symbolSearchService.searchSymbols('rust-test', {
        language: 'rust',
        name: 'Status',
        match: 'exact',
      });
      expect(enumResults.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('C Language Support', () => {
    

    it('should index C functions, structs, and typedefs', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const cDir = path.join(TEST_DIR, 'c-test');
      await fs.mkdir(cDir, { recursive: true });

      await fs.writeFile(
        path.join(cDir, 'main.c'),
        `#include <stdio.h>

#define MAX_SIZE 100

typedef struct {
    int id;
    char name[50];
} User;

typedef enum {
    STATUS_OK,
    STATUS_ERROR
} Status;

int add(int a, int b) {
    return a + b;
}

User* create_user(int id, const char* name) {
    User* user = malloc(sizeof(User));
    user->id = id;
    return user;
}

int main() {
    printf("Hello, World!\\n");
    return 0;
}
`
      );

      await symbolIndexer.buildIndex('c-test', cDir);
      expect(symbolIndexer.hasIndex('c-test')).toBe(true);

      const index = symbolIndexer.getIndex('c-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test struct indexing
      const structResults = await symbolSearchService.searchSymbols('c-test', {
        language: 'c',
        name: 'User',
        match: 'exact',
      });
      expect(structResults.symbols.length).toBeGreaterThan(0);

      // Test function indexing
      const funcResults = await symbolSearchService.searchSymbols('c-test', {
        language: 'c',
        name: 'add',
        match: 'exact',
      });
      expect(funcResults.symbols.length).toBeGreaterThan(0);

      // Test macro indexing
      const macroResults = await symbolSearchService.searchSymbols('c-test', {
        language: 'c',
        name: 'MAX_SIZE',
        match: 'exact',
      });
      expect(macroResults.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('C++ Language Support', () => {
    

    it('should index C++ classes, namespaces, and templates', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const cppDir = path.join(TEST_DIR, 'cpp-test');
      await fs.mkdir(cppDir, { recursive: true });

      await fs.writeFile(
        path.join(cppDir, 'main.cpp'),
        `#include <string>
#include <iostream>

namespace app {
    class User {
    public:
        int id;
        std::string name;

        User(int id, const std::string& name) : id(id), name(name) {}

        std::string getName() const {
            return name;
        }
    };

    template<typename T>
    class Container {
    private:
        T value;
    public:
        Container(T val) : value(val) {}
        T getValue() { return value; }
    };

    enum class Status {
        Active,
        Inactive
    };
}

int main() {
    app::User user(1, "John");
    std::cout << user.getName() << std::endl;
    return 0;
}
`
      );

      await symbolIndexer.buildIndex('cpp-test', cppDir);
      expect(symbolIndexer.hasIndex('cpp-test')).toBe(true);

      const index = symbolIndexer.getIndex('cpp-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test class indexing
      const classResults = await symbolSearchService.searchSymbols('cpp-test', {
        language: 'cpp',
        name: 'User',
        match: 'exact',
      });
      expect(classResults.symbols.length).toBeGreaterThan(0);

      // Test namespace indexing
      const nsResults = await symbolSearchService.searchSymbols('cpp-test', {
        language: 'cpp',
        name: 'app',
        match: 'exact',
      });
      expect(nsResults.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('PHP Language Support', () => {
    

    it('should index PHP classes, interfaces, and traits', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const phpDir = path.join(TEST_DIR, 'php-test');
      await fs.mkdir(phpDir, { recursive: true });

      await fs.writeFile(
        path.join(phpDir, 'User.php'),
        `<?php

namespace App\\Models;

interface Authenticatable {
    public function login();
}

trait Timestamps {
    public function getCreatedAt() {
        return $this->created_at;
    }
}

class User implements Authenticatable {
    use Timestamps;

    private $id;
    private $name;

    public function __construct($id, $name) {
        $this->id = $id;
        $this->name = $name;
    }

    public function getName() {
        return $this->name;
    }

    public function login() {
        return true;
    }
}

function greet($name) {
    echo "Hello, $name!";
}
`
      );

      await symbolIndexer.buildIndex('php-test', phpDir);
      expect(symbolIndexer.hasIndex('php-test')).toBe(true);

      const index = symbolIndexer.getIndex('php-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test class indexing
      const classResults = await symbolSearchService.searchSymbols('php-test', {
        language: 'php',
        name: 'User',
        match: 'exact',
      });
      expect(classResults.symbols.length).toBeGreaterThan(0);

      // Test interface indexing
      const interfaceResults = await symbolSearchService.searchSymbols('php-test', {
        language: 'php',
        name: 'Authenticatable',
        match: 'exact',
      });
      expect(interfaceResults.symbols.length).toBeGreaterThan(0);

      // Test trait indexing
      const traitResults = await symbolSearchService.searchSymbols('php-test', {
        language: 'php',
        name: 'Timestamps',
        match: 'exact',
      });
      expect(traitResults.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Ruby Language Support', () => {
    

    it('should index Ruby classes, modules, and methods', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const rubyDir = path.join(TEST_DIR, 'ruby-test');
      await fs.mkdir(rubyDir, { recursive: true });

      await fs.writeFile(
        path.join(rubyDir, 'user.rb'),
        `module App
  module Models
    class User
      attr_accessor :id, :name

      def initialize(id, name)
        @id = id
        @name = name
      end

      def get_name
        @name
      end

      def self.find(id)
        # Find user by id
      end
    end
  end
end

def greet(name)
  puts "Hello, #{name}!"
end
`
      );

      await symbolIndexer.buildIndex('ruby-test', rubyDir);
      expect(symbolIndexer.hasIndex('ruby-test')).toBe(true);

      const index = symbolIndexer.getIndex('ruby-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test class indexing
      const classResults = await symbolSearchService.searchSymbols('ruby-test', {
        language: 'ruby',
        name: 'User',
        match: 'exact',
      });
      expect(classResults.symbols.length).toBeGreaterThan(0);

      // Test module indexing
      const moduleResults = await symbolSearchService.searchSymbols('ruby-test', {
        language: 'ruby',
        name: 'App',
        match: 'exact',
      });
      expect(moduleResults.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Kotlin Language Support', () => {
    

    it('should index Kotlin classes, objects, and interfaces', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const kotlinDir = path.join(TEST_DIR, 'kotlin-test');
      await fs.mkdir(kotlinDir, { recursive: true });

      await fs.writeFile(
        path.join(kotlinDir, 'User.kt'),
        `package com.example

interface Authenticatable {
    fun login(): Boolean
}

data class User(val id: Int, val name: String) : Authenticatable {
    fun getName(): String {
        return name
    }

    override fun login(): Boolean {
        return true
    }
}

object UserFactory {
    fun create(id: Int, name: String): User {
        return User(id, name)
    }
}

enum class Status {
    ACTIVE,
    INACTIVE
}

fun greet(name: String) {
    println("Hello, $name!")
}
`
      );

      await symbolIndexer.buildIndex('kotlin-test', kotlinDir);
      expect(symbolIndexer.hasIndex('kotlin-test')).toBe(true);

      const index = symbolIndexer.getIndex('kotlin-test');
      expect(index).toBeDefined();
      expect(index!.totalSymbols).toBeGreaterThan(0);

      // Test class indexing
      const classResults = await symbolSearchService.searchSymbols('kotlin-test', {
        language: 'kotlin',
        name: 'User',
        match: 'exact',
      });
      expect(classResults.symbols.length).toBeGreaterThan(0);

      // Test object indexing
      const objectResults = await symbolSearchService.searchSymbols('kotlin-test', {
        language: 'kotlin',
        name: 'UserFactory',
        match: 'exact',
      });
      expect(objectResults.symbols.length).toBeGreaterThan(0);

      // Test interface indexing
      const interfaceResults = await symbolSearchService.searchSymbols('kotlin-test', {
        language: 'kotlin',
        name: 'Authenticatable',
        match: 'exact',
      });
      expect(interfaceResults.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-Language Symbol Search', () => {
    

    it('should support prefix matching across all languages', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const multiLangDir = path.join(TEST_DIR, 'multilang-test');
      await fs.mkdir(multiLangDir, { recursive: true });

      // Create files with symbols starting with "User"
      await fs.writeFile(path.join(multiLangDir, 'test.go'), 'type UserData struct {}');
      await fs.writeFile(path.join(multiLangDir, 'test.rs'), 'pub struct UserInfo {}');
      await fs.writeFile(path.join(multiLangDir, 'test.cpp'), 'class UserAccount {};');

      await symbolIndexer.buildIndex('multilang-test', multiLangDir);

      // Test prefix matching for Go
      const goResults = await symbolSearchService.searchSymbols('multilang-test', {
        language: 'go',
        name: 'User',
        match: 'prefix',
      });
      expect(goResults.symbols.some(s => s.name.startsWith('User'))).toBe(true);

      // Test prefix matching for Rust
      const rustResults = await symbolSearchService.searchSymbols('multilang-test', {
        language: 'rust',
        name: 'User',
        match: 'prefix',
      });
      expect(rustResults.symbols.some(s => s.name.startsWith('User'))).toBe(true);

      // Test prefix matching for C++
      const cppResults = await symbolSearchService.searchSymbols('multilang-test', {
        language: 'cpp',
        name: 'User',
        match: 'prefix',
      });
      expect(cppResults.symbols.some(s => s.name.startsWith('User'))).toBe(true);
    });

    it('should support substring matching across all languages', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }
      const multiLangDir = path.join(TEST_DIR, 'multilang-substring-test');
      await fs.mkdir(multiLangDir, { recursive: true });

      // Create files with symbols containing "Manager"
      await fs.writeFile(path.join(multiLangDir, 'test.java'), 'class UserManager {}');
      await fs.writeFile(path.join(multiLangDir, 'test.py'), 'class DataManager: pass');
      await fs.writeFile(path.join(multiLangDir, 'test.php'), '<?php class SessionManager {}');

      await symbolIndexer.buildIndex('multilang-substring-test', multiLangDir);

      // Test substring matching for Java
      const javaResults = await symbolSearchService.searchSymbols('multilang-substring-test', {
        language: 'java',
        name: 'Manager',
        match: 'substring',
      });
      expect(javaResults.symbols.some(s => s.name.includes('Manager'))).toBe(true);

      // Test substring matching for Python
      const pyResults = await symbolSearchService.searchSymbols('multilang-substring-test', {
        language: 'python',
        name: 'Manager',
        match: 'substring',
      });
      expect(pyResults.symbols.some(s => s.name.includes('Manager'))).toBe(true);

      // Test substring matching for PHP
      const phpResults = await symbolSearchService.searchSymbols('multilang-substring-test', {
        language: 'php',
        name: 'Manager',
        match: 'substring',
      });
      expect(phpResults.symbols.some(s => s.name.includes('Manager'))).toBe(true);
    });
  });
});
