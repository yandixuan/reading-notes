# InheritableThreadLocal

```java

    // 在thread中初始化线程中有这样一段代码

    /**
     * Initializes a Thread with the current AccessControlContext.
     * @see #init(ThreadGroup,Runnable,String,long,AccessControlContext,boolean)
     */
    private void init(ThreadGroup g, Runnable target, String name,
                      long stackSize) {
        init(g, target, name, stackSize, null, true);
    }



    private void init(ThreadGroup g, Runnable target, String name,
                      long stackSize, AccessControlContext acc,
                      boolean inheritThreadLocals
                      ) {
     ......

    // parent为当前线程，也就是调用了new Thread();方法的线程
    Thread parent = currentThread();
    // 这里是重点，当父线程的inheritableThreadLocals 不为空的时候，会调用 ThreadLocal.createInheritedMap方法，
    // 传入的是父线程的inheritableThreadLocals。原来复制变量的秘密在这里
    if (parent.inheritableThreadLocals != null)
        this.inheritableThreadLocals =
            ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);
        /* Stash the specified stack size in case the VM cares */
        this.stackSize = stackSize;
    ......
    }

```

```java
    public class InheritableThreadLocal<T> extends ThreadLocal<T> {
        /**
         * Computes the child's initial value for this inheritable thread-local
         * variable as a function of the parent's value at the time the child
         * thread is created.  This method is called from within the parent
         * thread before the child is started.
         * <p>
         * This method merely returns its input argument, and should be overridden
         * if a different behavior is desired.
         *
         * @param parentValue the parent thread's value
         * @return the child thread's initial value
         */
        protected T childValue(T parentValue) {
            return parentValue;
        }

        /**
         * Get the map associated with a ThreadLocal.
         *
         * @param t the current thread
         */
        ThreadLocalMap getMap(Thread t) {
           return t.inheritableThreadLocals;
        }

        /**
         * Create the map associated with a ThreadLocal.
         *
         * @param t the current thread
         * @param firstValue value for the initial entry of the table.
         */
        // InheritableThreadLocal重写了父类的方法，会往线程中inheritableThreadLocals属性中写入 threadLocal
        // 自然该线程创建子线程的时候 子线程会复制 父线程的ThreaLocal 从而达到效果
        void createMap(Thread t, T firstValue) {
            t.inheritableThreadLocals = new ThreadLocalMap(this, firstValue);
        }
    }
```
