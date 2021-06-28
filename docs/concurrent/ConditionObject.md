# ConditionObject

该类属于 AQS 的内部类，实现了 Condition 接口，并且实现了其中的 await(),signal(),signalAll()等方法

所以我单独拎出来进行源码分析

:::tip 重要

等待队列是一个 FIFO 的队列，在队列的每个节点都包含了一个线程引用。该线程就是在 Condition 对象上等待的线程。
这里的节点和 AQS 中的同步队列中的节点一样，使用的都是 AbstractQueuedSynchronizer.Node 类。每个调用了 condition.await()的线程都会进入到等待队列中去。
因为条件队列是在锁中调用的，所以不存在并发问题

:::

```java

    public class ConditionObject implements Condition, java.io.Serializable {
        private static final long serialVersionUID = 1173984872572414699L;
        /** First node of condition queue. */
        /** 等待列队的第一个节点 */
        private transient Node firstWaiter;
        /** Last node of condition queue. */
        /** 等待列队的最后一个节点 */
        private transient Node lastWaiter;
    }

```

## 方法

### await()

该方法是响应中断的

```java

    public final void await() throws InterruptedException {
        // 如果线程被中断，抛出异常
        if (Thread.interrupted())
            throw new InterruptedException();
        // 入队列
        Node node = addConditionWaiter();
        // 释放当前节点拥有的状态值，暂存下来
        int savedState = fullyRelease(node);
        int interruptMode = 0;
        // isOnSyncQueue(Node)用来判断节点所代表的线程是否在同步队列中
        while (!isOnSyncQueue(node)) {
            // 当前线程（节点）不在同步队列中，就休息当前线程
            LockSupport.park(this);
            /**
             *  方法checkInterruptWhileWaiting(Node)
             *  在通知前发生中断返回THROW_IE，在通知后发生中断返回 REINTERRUPT，在等待通知的过程中没发生中断返回0
             */
            if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
                break;
        }
        /**
         * 执行到此，说明退出了上前的while循环，即从休眠状态中被唤醒了(从LockSupport.park（）方法返回了)，且当前线程（节点）在同步队列中。
         * 在同步队列中了，当前线程又调用acquireQueued(Node,int)抢锁
         */
        if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
            interruptMode = REINTERRUPT;
        if (node.nextWaiter != null) // clean up if cancelled
            // 将被成功通知（即从休眠中唤醒的）的线程对应的节点从条件队列中移除
            unlinkCancelledWaiters();
        if (interruptMode != 0)
            /**
             *记录中断状态
             * 如果interruptMode的值是THROW_IE，直接抛出中断异常
             * 如果interruptMode的值是REINTERRUPT，则调用Thread.interrupt()中断当前线程（实际上只是置中断标志位，可能根本不会真正中断当前线程）
             */
            reportInterruptAfterWait(interruptMode);
    }

```

### addConditionWaiter

```java

    private Node addConditionWaiter() {
        Node t = lastWaiter;
        // If lastWaiter is cancelled, clean out.
        // 如果lastWaiter不等于空并且waitStatus不等于CONDITION时
        if (t != null && t.waitStatus != Node.CONDITION) {
            // 清除队列中状态不为CONDITION的节点
            unlinkCancelledWaiters();
            // 赋值最新值
            t = lastWaiter;
        }
        // 构造一个新的节点，状态是CONDITION
        Node node = new Node(Thread.currentThread(), Node.CONDITION);
        if (t == null)
            firstWaiter = node;
        else
            t.nextWaiter = node;
        lastWaiter = node;
        return node;
    }

```

### fullyRelease

### checkInterruptWhileWaiting

检查线程的中断，如果在唤醒前被中断，抛出 THROW_IE，如果唤醒后中断抛出 REINTERRUPT

```java

     /**
      * Checks for interrupt, returning THROW_IE if interrupted
      * before signalled, REINTERRUPT if after signalled, or
      * 0 if not interrupted.
      */
    private int checkInterruptWhileWaiting(Node node) {
        // 如果线程被中断，调用 transferAfterCancelledWait 方法判断后续的处理应该是抛出 InterruptedException 还是重新中断
        return Thread.interrupted() ?
            (transferAfterCancelledWait(node) ? THROW_IE : REINTERRUPT) :
            0;
    }
```

### transferAfterCancelledWait

- 如果当前线程没有被中断过，则返回 0
- 如果当前线程被中断时没有被 signal 过，则返回 THROW_IE
- 如果当前线程被中断时已经 signal 过了，则返回 REINTERRUPT

```java
    /**
     * 本方法是用来判断当前线程被中断时有没有发生过signal，以此来区分出THROW_IE和REINTERRUPT。判断的依据是：
     * 如果发生过signal，则当前节点的状态已经不是CONDITION了，并且在CLH队列中也能找到该节点。详见transferForSignal方法
     * <p>
     * THROW_IE：表示在线程中断发生时还没有调用过signal方法，这个时候我们将这个节点放进CLH队列中去抢资源，
     * 直到抢到锁资源后，再把这个节点从CLH队列和条件队列中都删除掉，最后再抛出InterruptedException
     * <p>
     * REINTERRUPT：表示在线程中断发生时已经调用过signal方法了，这个时候发不发生中断实际上已经没有意义了，
     * 因为该节点此时已经被放进到了CLH队列中。而且在signal方法中已经将这个节点从条件队列中剔除掉了
     * 此时我们将这个节点放进CLH队列中去抢资源，直到抢到锁资源后（抢到资源的同时就会将这个节点从CLH队列中删除），
     * 再次中断当前线程即可，并不会抛出InterruptedException
     */
    final boolean transferAfterCancelledWait(Node node) {

        if (compareAndSetWaitStatus(node, Node.CONDITION, 0)) {
            // 如果修改状态成功，入CLH队列
            enq(node);
            return true;
        }
        /*
         * If we lost out to a signal(), then we can't proceed
         * until it finishes its enq().  Cancelling during an
         * incomplete transfer is both rare and transient, so just
         * spin.
         */
        /**
         * 如果CAS失败了的话就意味着当前节点已经不是CONDITION状态了，说明此时已经调用过signal方法了，
         * 但是因为之前已经释放锁资源了，signal方法中的transferForSignal方法将节点状态改为CONDITION
         * 和将节点入CLH队列的这两个操作不是原子操作，所以可能存在并发的问题。也就是说可能会存在将节点状态改为CONDITION后，
         * 但是还没入CLH队列这个时间点。下面的代码考虑的就是这种场景。这个时候只需要不断让渡当前线程资源，
         * 等待signal方法将节点添加CLH队列完毕后即可
         */
        while (!isOnSyncQueue(node))
            Thread.yield();
        return false;
    }
```
