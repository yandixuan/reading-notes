# FutureTask

```java
    public class FutureTask<V> implements RunnableFuture<V> {
    ...
    }

```

## 属性

```java

    /**
     * The run state of this task, initially NEW.  The run state
     * transitions to a terminal state only in methods set,
     * setException, and cancel.  During completion, state may take on
     * transient values of COMPLETING (while outcome is being set) or
     * INTERRUPTING (only while interrupting the runner to satisfy a
     * cancel(true)). Transitions from these intermediate to final
     * states use cheaper ordered/lazy writes because values are unique
     * and cannot be further modified.
     *
     * Possible state transitions:
     * NEW -> COMPLETING -> NORMAL
     * NEW -> COMPLETING -> EXCEPTIONAL
     * NEW -> CANCELLED
     * NEW -> INTERRUPTING -> INTERRUPTED
     */
    private volatile int state;
    private static final int NEW          = 0;
    private static final int COMPLETING   = 1;
    private static final int NORMAL       = 2;
    private static final int EXCEPTIONAL  = 3;
    private static final int CANCELLED    = 4;
    private static final int INTERRUPTING = 5;
    private static final int INTERRUPTED  = 6;

    // 状态值解析
    NEW          （初始状态 表示是个新的任务或者还没被执行完的任务）
    COMPLETING   （当任务被设置结果时，处于COMPLETING状态，这是一个中间状态）
    NORMAL       （表示任务正常结束）
    EXCEPTIONAL  （表示任务因异常而结束）
    CANCELLED    （任务还未执行之前就调用了cancel(true)方法，任务处于CANCELLED）
    INTERRUPTING （当任务调用cancel(true)中断程序时，任务处于INTERRUPTING状态，这是一个中间状态）
    INTERRUPTED  （任务调用cancel(true)中断程序时会调用interrupt()方法中断线程运行，任务状态由INTERRUPTING转变为INTERRUPTED）

    // 任务结果回调
    /** The underlying callable; nulled out after running */
    private Callable<V> callable;
    // 任务结果
    /** The result to return or exception to throw from get() */
    private Object outcome; // non-volatile, protected by state reads/writes
    // 执行 callable 回调的线程
    /** The thread running the callable; CASed during run() */
    private volatile Thread runner;
    // 等待的线程
    /** Treiber stack of waiting threads */
    private volatile WaitNode waiters;

    // UNSAFE 主要提供一些用于执行低级别、不安全操作的方法，如直接访问系统内存资源、自主管理内存资源等
    private static final sun.misc.Unsafe UNSAFE;

    private static final long stateOffset;
    private static final long runnerOffset;
    private static final long waitersOffset;
    static {
        try {
            // 获取实例
            UNSAFE = sun.misc.Unsafe.getUnsafe();
            // 获取FutureTask class 类
            Class<?> k = FutureTask.class;
            // 获取state在内存中的偏移量
            stateOffset = UNSAFE.objectFieldOffset
                (k.getDeclaredField("state"));
            // 获取runner在内存中的偏移量
            runnerOffset = UNSAFE.objectFieldOffset
                (k.getDeclaredField("runner"));
            // 获取waiters在内存中的偏移量
            waitersOffset = UNSAFE.objectFieldOffset
                (k.getDeclaredField("waiters"));
        } catch (Exception e) {
            throw new Error(e);
        }
    }


```

## 构造方法

```java



```

## 内部类

```java
    // 比较简单 封装 当前线程为等待节点 以及 指向 下一个等待节点
    static final class WaitNode {
        volatile Thread thread;
        volatile WaitNode next;
        WaitNode() { thread = Thread.currentThread(); }
    }

```

## 方法

### cancel

任务的取消 mayInterruptIfRunning 字面意思 如果为 true 即使是任务在执行也中断

```java

    public boolean cancel(boolean mayInterruptIfRunning) {
        // 如果状态是初始状态 但是 CAS 设置 状态失败 直接返回fasle
        // 如果状态是初始状态 并且设置了 INTERRUPTING 或者 CANCELLED

        if (!(state == NEW &&
              UNSAFE.compareAndSwapInt(this, stateOffset, NEW,
                  mayInterruptIfRunning ? INTERRUPTING : CANCELLED)))
            return false;
        try {    // in case call to interrupt throws exception
            // 根据 mayInterruptIfRunning 来决定是否中断任务
            if (mayInterruptIfRunning) {
                try {
                    // 获取执行任务的线程
                    Thread t = runner;
                    if (t != null)
                        // 打上中断标志
                        t.interrupt();
                } finally { // final state
                    // 最后CAS将线程状态设置成已中断状态
                    UNSAFE.putOrderedInt(this, stateOffset, INTERRUPTED);
                }
            }
        } finally {
            finishCompletion();
        }
        return true;
    }


```

### run

本身 FutureTask 实现了 Runnable

```java
    public void run() {
        // 如果当前状态不是初始 或者 无法将当前线程 CAS设置到 runner字段（当前任务已经被线程占据）那么直接返回
        if (state != NEW ||
            !UNSAFE.compareAndSwapObject(this, runnerOffset,
                                         null, Thread.currentThread()))
            return;
        try {
            Callable<V> c = callable;
            // callable不为空 并且  状态为初始 代表能执行
            if (c != null && state == NEW) {
                V result;
                boolean ran;
                try {
                    // callable 便是一个任务执行单元
                    // 执行
                    result = c.call();
                    // 没有异常 标志 true
                    ran = true;
                } catch (Throwable ex) {
                    // 发生异常 标志 false 并 存储异常
                    result = null;
                    ran = false;
                    setException(ex);
                }
                if (ran)
                    // 如果 标志是true 设置结果
                    set(result);
            }
        } finally {
            // runner must be non-null until state is settled to
            // prevent concurrent calls to run()
            // 到这里 可以不用CAS 因为别的线程无法持有 直接 GC
            runner = null;
            // state must be re-read after nulling runner to prevent
            // leaked interrupts
            // 获取 state
            int s = state;
            // 如果状态正处于 大于等于 中断的中间状态
            if (s >= INTERRUPTING)
                handlePossibleCancellationInterrupt(s);
        }
    }

```

### setException

```java
    protected void setException(Throwable t) {
        // CAS 设置状态 期望是 NEW 设置 成 COMPLETING
        if (UNSAFE.compareAndSwapInt(this, stateOffset, NEW, COMPLETING)) {
            // 进入这里说明 没有线程在操作
            // 直接将异常赋值给 outCome 字段
            outcome = t;
            CAS 将状态设置成异常
            UNSAFE.putOrderedInt(this, stateOffset, EXCEPTIONAL); // final state
            finishCompletion();
        }
    }
```

### finishCompletion

应该是结束的意思

```java

    private void finishCompletion() {
        // assert state > COMPLETING;
        // 循环等待节点 直到 q不为空
        for (WaitNode q; (q = waiters) != null;) {
            // 如果CAS设置 waiters 为 null 成功
            if (UNSAFE.compareAndSwapObject(this, waitersOffset, q, null)) {
                // 进入死循环
                for (;;) {
                    // 获取等待节点的线程
                    Thread t = q.thread;
                    if (t != null) {
                        // 将等待节点的线程指向null
                        q.thread = null;
                        // 唤醒线程 因为已经结束了 不需要等待了
                        LockSupport.unpark(t);
                    }
                    // 获取下一个节点
                    WaitNode next = q.next;
                    if (next == null)
                        // 没有了就终止循环
                        break;
                    // 将q对next的引用断开 为了让gc 回收 q现在指代的对象
                    q.next = null; // unlink to help gc
                    // 将next 指向 q节点 继续循环
                    q = next;
                }
                break;
            }
        }

        done();

        callable = null;        // to reduce footprint
    }

```

### handlePossibleCancellationInterrupt

这里线程只是被打上了中断标记，一直

```java
    private void handlePossibleCancellationInterrupt(int s) {
        // It is possible for our interrupter to stall before getting a
        // chance to interrupt us.  Let's spin-wait patiently.
        // 如果任务处于中断的过渡状态
        if (s == INTERRUPTING)
            // 让运行线程一直放弃CPU占用 直到任务被打上 已打断标志
            while (state == INTERRUPTING)
                // 线程让渡，主动放弃持有cpu占用。和 wait 有点区别；
                Thread.yield(); // wait out pending interrupt

        // assert state == INTERRUPTED;

        // We want to clear any interrupt we may have received from
        // cancel(true).  However, it is permissible to use interrupts
        // as an independent mechanism for a task to communicate with
        // its caller, and there is no way to clear only the
        // cancellation interrupt.
        //
        // Thread.interrupted();
    }


```

### runAndReset

周期性执行，每次正常执行完后状态依然是 New(应该是周期性任务线程池会用到)

```java

    protected boolean runAndReset() {
        if (state != NEW ||
            !UNSAFE.compareAndSwapObject(this, runnerOffset,
                                         null, Thread.currentThread()))
            return false;
        boolean ran = false;
        int s = state;
        try {
            Callable<V> c = callable;
            if (c != null && s == NEW) {
                try {
                    c.call(); // don't set result
                    ran = true;
                } catch (Throwable ex) {
                    setException(ex);
                }
            }
        } finally {
            // runner must be non-null until state is settled to
            // prevent concurrent calls to run()
            runner = null;
            // state must be re-read after nulling runner to prevent
            // leaked interrupts
            s = state;
            if (s >= INTERRUPTING)
                handlePossibleCancellationInterrupt(s);
        }
        // 这里跟RUN 的区别就是 这里会将状态 重置成 初始状态
        return ran && s == NEW;
    }

```

### awaitDone

在指定的时间内 等待完成结果 或者 直接中断 抛出异常

```java

    private int awaitDone(boolean timed, long nanos)
        throws InterruptedException {
        // 截止时间
        final long deadline = timed ? System.nanoTime() + nanos : 0L;
        // 定义 waitNode q
        WaitNode q = null;

        boolean queued = false;
        // 死循环
        for (;;) {
            // 测试当前线程是否被中断，同时会清除中断标记
            if (Thread.interrupted()) {
                removeWaiter(q);
                throw new InterruptedException();
            }
            // 获取任务状态
            int s = state;
            // 如果任务状态大于 COMPLETING 可能完成 或者 中断了
            if (s > COMPLETING) {
                // 并且 waitNode不为空
                if (q != null)
                    // waitNode的线程清空
                    q.thread = null;
                // 返回状态
                return s;
            }
            // 如果正处于完成的中间状态
            else if (s == COMPLETING) // cannot time out yet
                // 让出cpu
                Thread.yield();
            else if (q == null)
                // 如果q为空那么创建waitNode
                q = new WaitNode();
            else if (!queued)
                // 如果没有形成队列 CAS 设置q的下一个节点为
                queued = UNSAFE.compareAndSwapObject(this, waitersOffset,
                                                        q.next = waiters, q);
            else if (timed) {
                // 计算还有多少时间
                nanos = deadline - System.nanoTime();
                if (nanos <= 0L) {
                    // 如果超时了移除等待
                    removeWaiter(q);
                    // 返回状态
                    return state;
                }
                // 根据nanos 停泊当前线程
                LockSupport.parkNanos(this, nanos);
            }
            // 如果 timed为false让当前线程等待
            else
                LockSupport.park(this);
        }
    }

```

### removeWaiter

移除等待队列

```java

    private void removeWaiter(WaitNode node) {
        if (node != null) {
            // 将node的线程指向null help gc
            node.thread = null;
            retry:
            // 进入死循环 重新开启移除等待节点竞赛
            for (;;) {          // restart on removeWaiter race
                // 接着循环 node 定义 pred,q为 waiters ,s
                // 只要q不为null 继续循环
                // 结束循环  将s指向q
                for (WaitNode pred = null, q = waiters, s; q != null; q = s) {
                    // s为下一个节点
                    s = q.next;
                    // 如果 q的线程不为null
                    if (q.thread != null)
                        // pred 指向 q
                        pred = q;
                    // 进入这里说明q的线程已经指向了null
                    else if (pred != null) {
                        // pred 链接 到 s
                        pred.next = s;
                        // 检查 pred 的 线程是否为空
                        if (pred.thread == null) // check for race
                            // 返回retry继续重新构造 等待列队
                            continue retry;
                    }
                    // 如果pred为空了 那么直接 CAS设置s为等待节点 失败继续回到retry
                    else if (!UNSAFE.compareAndSwapObject(this, waitersOffset,
                                                          q, s))
                        continue retry;
                }
                break;
            }
        }
    }


```
