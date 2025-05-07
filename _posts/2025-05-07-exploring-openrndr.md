---
layout: post
title:  "OPENRNDR in PraxisLIVE"
author: Neil C Smith
main_image_path: "/assets/pl-openrndr-banner.jpg"
description: Exploring OPENRNDR in PraxisLIVE using custom recodeable roots
---

A lot of focus in recent releases of PraxisLIVE has been on support for custom
roots and base components. This allows for building out a range of components
to use with third-party libraries, all within the context of an individual project.
And this being PraxisLIVE, all aspects being live recodeable as you do so!

Over the last few weeks, I've been exploring [OPENRNDR](https://openrndr.org/) -
a fantastic open source creative coding framework that offers an alternative to
the built-in support for Processing inside PraxisLIVE.

<a href="/assets/pl-openrndr.png" data-lightbox="pl-openrndr" data-title="Live coding OPENRNDR in PraxisLIVE"><img alt="Live coding OPENRNDR in PraxisLIVE" src="/assets/pl-openrndr-sm.png" /></a>

OPENRNDR maps well to a node graph based on similar principles to the core Processing
support, and makes use of a number of libraries already in PraxisCORE. At the same
time, it is written in Kotlin so throws up some interesting challenges for
using it from a Java context (the page on
[Calling Kotlin from Java](https://kotlinlang.org/docs/java-to-kotlin-interop.html)
is very useful!).

I've uploaded a repository with the example code discussed here, that can also be
used as a template for exploration. Aside from the logo image, everything is
contained within the two source files for the project and root.

[https://github.com/codelerity/pl-openrndr/](https://github.com/codelerity/pl-openrndr/)

All seems to be working well on Linux and Windows at the moment. I'm working on
a fix for the image nodes that seem to be causing issues on macOS. This is also
using OPENRNDR 0.4.4 for now, due to another issue with the latest alphas.

## Project definition

The first file in the project is the
[project.pxp](https://github.com/codelerity/pl-openrndr/blob/main/OPENRNDR/project.pxp)
file. In the IDE, this project is edited via the project properties. There are two
key changes for the hub and libraries. The hub definition is changed to load all
roots in a separate JVM launched with the same necessary Java options for the
OpenGL support as in the built-in Processing (`root:video`) support.

```
java-options {
  -XstartOnFirstThread
  -XX:+IgnoreUnrecognizedVMOptions
  -Djava.awt.headless=true
}
```

The libraries section adds three PackageURLs for OPENRNDR artefacts on Maven
Central. These will automatically be resolved and downloaded when you run the
project, using the [MIMA](https://github.com/maveniverse/mima) support built in
to PraxisCORE. The various LWJGL dependencies required by OPENRNDR are already
in the runtime and will be resolved from there.

```
libraries {
  "pkg:maven/org.jetbrains.kotlin/kotlin-stdlib@2.1.10"
  "pkg:maven/org.openrndr/openrndr-application-jvm@0.4.4"
  "pkg:maven/org.openrndr/openrndr-gl3-jvm@0.4.4"
}
```

Within the IDE, libraries can be added to a project using the project properties.
See more at [https://docs.praxislive.org/coding-libraries/](https://docs.praxislive.org/coding-libraries/)

## Custom root graph

The second file is the
[openrndr.pxr](https://github.com/codelerity/pl-openrndr/blob/main/OPENRNDR/openrndr.pxr)
root graph. All of the integration code to work with OPENRNDR is in this file.
Within the IDE, look at the Shared Code files, the root code (`Edit Code` in the
graph background popup), as well as the code of individual nodes.

I'm not going to go into every aspect of the integration, but some key things to
look for include -

### Driver proxy

A key integration point between OPENRNDR and PraxisCORE happens in the root code
at -

```java
@Driver Consumer<Boolean> processor = this::process;

private void process(boolean active) {
    if (!active) {
        tell(self("stop"), "");
        return;
    }
    // call graph and render to window
    RenderTarget rt = getRenderTarget();
    rt = sink.process(rt);
    program.getDrawer().image(rt.colorBuffer(0));
    releaseRenderTarget(rt);
}
```

The [@Driver](https://javadoc.io/static/org.praxislive/praxiscore/6.2.0/org.praxislive.code/org/praxislive/code/CodeRootDelegate.Driver.html)
annotation works similarly to [@Proxy](https://javadoc.io/doc/org.praxislive/praxiscore/latest/org.praxislive.code/org/praxislive/code/userapi/Proxy.html)
but can only be applied to an interface implementation in a root. PraxisCORE uses
a kind of wrapper injection to wrap the field value in a proxy implementation which
drives the root graph every time a call is made. This way the OPENRNDR rendering
thread can drive the component graph.

The `processor` wrapper (now the value of this field) is passed into the very simple
`SHARED.RNDRProgram` implementation of `Program` and called on every render. This
interface could have been `Runnable` except that we also want to call it when the
rendering exits due to the window closing. The `RNDRProgram` is passed to the
`MainThread` executor, ensuring it runs on the startup thread of the JVM,
required for OpenGL rendering on some platforms.

### Data pipes

The next key integration point is the use of
[Data Pipes](https://javadoc.io/doc/org.praxislive/praxiscore/latest/org.praxislive.code/org/praxislive/code/userapi/Data.html)
to pass OPENRNDR's `RenderTarget` surfaces through the node graph. The root code
includes -

```java
@Ref.Publish
@Inject Ref<Data.Pipe<RenderTarget>> input;

@Inject Data.Sink<RenderTarget> sink;

public void init() {
    input.init(Data::identity);
    sink.onCreate(rt -> {
        return getRenderTarget();
    });
    sink.onClear(rt -> {
        rt.clearColor(0, CLEAR);
        return rt;
    });
    sink.onAccumulate((dst, src) -> {
        DrawerKt.isolatedWithTarget(program.getDrawer(), dst, unit(d -> {
            d.getDrawStyle().setBlendMode(BlendMode.ADD);
            d.image(src.colorBuffer(0));
        }));
        return dst;
    });
    sink.onDispose(rt -> {
        releaseRenderTarget(rt);
    });
    Data.link(input.get(), sink.input());
}
```

We use a `Ref` to publish an input that can be picked up and connected to by our
output nodes. This in turn is connected to a `Data.Sink` configured to create,
clear and add together render surfaces. Aside from the cache of `RenderTarget`
held elsewhere in the code, this is all that is required to enable a data graph
that includes support for adding multiple inputs and feedback paths.

The image in the header was created by adding a feedback path through a mix
component on the mouse driven circle -

<img src="/assets/pl-openrndr-feedback.png" alt="OPENRNDR feedback path" />

### Custom component registration

The various custom component types defined in Shared Code are registered inside
the root code -

```java
@SupportedTypes(custom = {
    @CustomType(type = "openrndr:draw", base = RNDRDraw.class,
            template = RNDRDraw.TEMPLATE),
    @CustomType(type = "openrndr:composite", base = RNDRComposite.class,
            template = RNDRComposite.TEMPLATE),
    @CustomType(type = "openrndr:image", base = RNDRImage.class),
    @CustomType(type = "openrndr:mix", base = RNDRMix.class),
    @CustomType(type = "openrndr:out", base = RNDROut.class)
})
public void init() { ...
```

All the custom component types are defined in Shared Code, and so are fully live
recodeable. The components that are designed to be extended with custom behaviour
have a defined code template as a starting point.

A cut down version of the `RNDRDraw` type shows how these are defined as subtypes
of `CodeCodeDelegate`. You can see how the data pipe configuration is handled
within the base type, allowing for user nodes to just draw on the surface with
the provided `Drawer`.

```java
public class RNDRDraw extends CoreCodeDelegate {

    public static final String TEMPLATE =
            = """
              import org.openrndr.*;
              import org.openrndr.draw.*;
              import static SHARED.OPENRNDR.*;

                  @Override
                  public void draw(Drawer d) {
                     \s
                  }
              """;

    @In(1) Data.In<RenderTarget> in;
    @Out(1) Data.Out<RenderTarget> out;

    @Ref.Subscribe
    @Inject Ref<Program> programRef;

    public Program program;

    @Override
    public void init() {
        Data.link(in, Data.with(this::process), out);
    }

    private void process(RenderTarget frame) {
        program = programRef.get();
        DrawerKt.isolatedWithTarget(program.getDrawer(), frame, unit(d -> {
                    draw(d);
        });
    }

    public abstract void draw(Drawer d);

}
```

Also note the `SHARED.OPENRNDR` utilities that are statically imported into the
template. These are used for simple, directly callable functions where OPENRNDR's 
API is complex to use from Java. It is also used to simplify other aspects of
the Kotlin interaction - eg. `unit(..)` to wrap consumers that need to return
Kotlin's `Unit.INSTANCE`.

## Next steps

Currently I'm looking at stabilising some aspects of this and then adding it to
the standard available project templates. In many ways, custom integrations like
this, doing more within projects while keeping the core lightweight is the future
direction of PraxisLIVE.

I'm also looking at a different custom library integration with
[Avaje Jex](https://avaje.io/jex/) and [HTMX](https://htmx.org/), as a possible
replacement GUI ... or even the basis of a fully recodeable editor.

Any thoughts or questions, please do jump in on the PraxisLIVE discussions at
[https://github.com/orgs/praxis-live/discussions](https://github.com/orgs/praxis-live/discussions),
or reach out some other way.

Thanks for reading!
