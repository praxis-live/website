---
layout: post
title:  "Just-in-Time Programming"
author: Neil C Smith
main_image_path: "/assets/flying-code.jpg"
description: The trials and tribulations of building a just-in-time programming system in Java
---

So, a few thoughts on the trials and tribulations of building a just-in-time programming
system in Java. But wait, isn't Java a JIT-compiled language anyway? Job done ... 
next post ... no, wait.

Firstly, let's be clear, Java isn't a JIT-compiled language, otherwise what's javac for?!
It (usually) has JIT-compiled bytecode, and that makes it a useful tool for this
endeavour, but that doesn't get us from source code to running code.
And anyway, there's far more to a useful just-in-time programming system
than just getting code running. Let's be clear about some requirements here.

- we want a system that allows us to write and rewrite code as it's running, at
any point in the lifecycle (no development vs production distinction)
- we want a system that allows us to replace code atomically _at the right time_
in order to provide glitch-free updates during real-time processing
- we want a system that allows us to easily and correctly manage resources added
 or removed at runtime
- we want a system that handles errors gracefully and carries on running while we fix
the problem
- and, we want a system that can persist its current state so that we can carry 
on running from where we left off at at a later date.

## Code as Data

PraxisCORE is a [forest-of-actors runtime](/blog/a-forest-of-actors/) for real-time
programming, designed to bring aspects of Erlang, SmallTalk and Extempore into the
Java world. Like Erlang, it allows for the code of individual actors to be hot replaced
at runtime. Unlike Erlang, and as far as I know unique amongst at least Java actor
frameworks, is that actors accept their new behaviour as a message containing Java
source code. This is great for providing SmallTalk like introspection and persistence,
ensuring formatting and comments remain part of the persisted image. It also gives
us a form of code as data - not full-on Lisp like homoiconicity, but still giving
us powerful metaprogramming capabilities.

## Got code, now what? No right of REPL.

Some people who've seen PraxisLIVE in action assume the runtime uses a form of hot code
reloading like the JVM's built-in agent based HotSwap mechanism; others that it's
using JShell, the Java REPL. The truth is that neither are suitable or can meet
all of the requirements outlined above. 

Java's built-in HotSwap mechanism allows for reloading classes at runtime. However,
it is limited to changes to code inside method bodies, without allowing for structural
changes such as adding/removing methods, fields, or (often) lambdas. There are a
number of projects that remove some of those limitations, such as
[JRebel](https://zeroturnaround.com/software/jrebel/) and
[HotSwapAgent/DCEVM](http://hotswapagent.org/), but they're a bit hacky, and in the latter
case require a patched JVM. They offer some utility in development, but not the level
of stability we're looking for. And there's part of me that thinks that if it's not
stable enough for production use, it's not _really_ stable enough for development.

Reloading classes with these HotSwap mechanisms has other problems that don't meet
our requirements above. Firstly we need to control exactly when the code change
occurs (not in the middle of processing something), and hook in to the code change to
correctly manage resources that are added or removed. But another problem is handling
our requirement for a system that can persist its current state. It is too easy with
this technique to remove code that is required, such as code that initializes 
a field. You get to a point where the project is running great, but when you stop
and re-run it, it all goes boom!

So, the PraxisCORE runtime eschews class reloading, in fact for something much simpler.
It's actually not hard to compile and execute new bytecode in a running Java application
by using a compiler interface and a custom classloader, and there are various
applications that do this. A (perceived) downside of this approach is that a class
in Java is defined not only by its name, but also the classloader that loads it.
Using this approach we are not changing an existing class but creating a whole new one.
But by careful use of our actor framework, and other common Java patterns like dependency
injection, we can turn this limitation to our advantage in delivering our requirements.

The JShell Java REPL also bears some similarity with how PraxisCORE works, including
similar contextual wrapping of Java source code in a class context with additional
imports. However, PraxisCORE does not use this either, and not only because it predates
JShell! A problem with REPLs is that they embed an iterative design process, and
potentially the only way to get back to a guaranteed state is to rerun the entire code
history. The PraxisCORE runtime and API is designed such that _code replacement is
transactional_, where the code and data at any point forms the entire picture.

## Behaviour | State | Identity

<img src="/assets/code-objects.png" alt="Diagram of CodeComponent, CodeContext and CodeDelegate" />

A standard Java object generally combines three things - behaviour, state and identity.
A re-codeable actor in PraxisCORE needs to breaks these things apart, with a separate
class for each.

- **CodeDelegate** is the base class that the user's code (automatically) extends, providing
the behaviour aspect of actor. There are different CodeDelegate base classes for most
base actor types, providing access to useful functions and fields, as well as optional
or required method hooks (eg. `init()` and `update()`).
- **CodeContext** is the class that manages state for our actor. There are currently
different CodeContext subtypes for each CodeDelegate subtype, and an instance of 
a CodeContext wraps each CodeDelegate instance. The CodeContext connects annotated
fields and methods in the CodeDelegate to the wider actor system, injecting state
and managing resources across context changes and for persistence. NB. this means
that although the CodeContext manages state, the schema for that state along with
internal updates are controlled by the user's code.
- **CodeComponent** is the simplest of the three, and provides the identity functionality.
It is the one class that exists throughout the lifecycle of an actor. It wraps
a CodeContext and a mechanism for replacing it, but otherwise delegates all aspects
of the component (actor) interface to the installed context. Unlike the other classes,
there is currently only one type of CodeComponent used for all actors.
- **CodeConnector** is an auxillary class, again currently one per CodeDelegate
type, that separates out the functionality of introspecting on the user's code 
and writing the "recipe" for the CodeContext.

The above allows a basic `core:custom` actor to accept the following simple snippet of code
and transform itself into an actor capable of adding a value to numbers it receives, as
well as automatically persisting that value -

```java
@P(1) double value;
@Out(1) Output out;

@In(1) void in(double x) {
    out.send(x + value);
}
```

Full information on writing custom components (actors), and all the base types and 
annotations available, is at [https://docs.praxislive.org/coding/](https://docs.praxislive.org/coding/)

## Compiler as a service

The PraxisCORE actor framework provides a service discovery mechanism, by which
actors can request the addresses of other actors providing particular services.
When an actor receives new source code, it does not handle turning this into a
CodeContext itself. This is definitely not a real-time safe operation! Instead it
looks up a service that can instantiate a CodeContext for it, based on the provided
source code and base type.

If the CodeContext service does not have previously compiled bytecode for this source
and base type, it may look up another service that provides access to the Java
compiler. The compiler service was split out from the CodeContext service in
PraxisLIVE v3 so that the compiler part can optionally be run in a separate process, or
even on a different machine, using the
[distributed hubs](https://docs.praxislive.org/distributed-hubs/) functionality.
This is particularly useful where garbage collection is an issue for low latency
pipelines.

The CodeContext service handles all introspection on the user's code, and a possible
previous iteration, which may include instantiating necessary resources or creating
the instructions to migrate from one iteration of code to the next. A key benefit of not
changing the existing class (eg. HotSwap) is that we can achieve all this in the
background while the existing code continues to execute.

When the CodeContext is ready, it is returned within an actor system message. The context
is already in such a state that it can be atomically replaced inside the CodeComponent with
minimal overhead, even in a low-latency pipeline (eg. real-time DSP). And despite
the various different services involved, possibly across processes, the efficiency
of the messaging system and the use of a memory-based filesystem for the
compiler (source and bytecode never on disk) means that the time between enacting
a change in the editor and that change being apparent is almost imperceptible.

## Conclusion

Hopefully this has been a useful brief(ish) exposition of how [PraxisCORE](/core) achieves
its goal of being a just-in-time programming runtime. If you've got any questions,
jump on the [mailing list, chat or otherwise send me a message](/community).

Otherwise, go have fun with it or come get involved ...

... and [donations (Donorbox with PayPal or card)](https://donorbox.org/praxislive)
are always appreciated!