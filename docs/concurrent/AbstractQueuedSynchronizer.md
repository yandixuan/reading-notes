# AbstractQueuedSynchronizer

提供了一个基于 FIFO 队列，可以用于构建锁或者其他相关同步装置的基础框架。该同步器（以下简称同步器）利用了一个 int 来表示状态，
期望它能够成为实现大部分同步需求的基础。使用的方法是继承，子类通过继承同步器并需要实现它的方法来管理其状态，
管理的方式就是通过类似 acquire 和 release 的方式来操纵状态

```java
    public abstract class AbstractQueuedSynchronizer
    extends AbstractOwnableSynchronizer
    implements java.io.Serializable {

    }
```

## 内部类

同步器的开始提到了其实现依赖于一个 FIFO 队列，那么队列中的元素 Node 就是保存着线程引用和线程状态的容器，
每个线程对同步器的访问，都可以看做是队列中的一个节点。

### Node

```java

    static final class Node {
        /** Marker to indicate a node is waiting in shared mode */
        /** 标志着等待的Node实例处于共享模式 */
        static final Node SHARED = new Node();
        /** Marker to indicate a node is waiting in exclusive mode */
        /** 标志着等待的Node实例处于独占模式 */
        static final Node EXCLUSIVE = null;

        /** waitStatus value to indicate thread has cancelled */
        /** 等待节点的对应的线程被取消了 */
        static final int CANCELLED =  1;
        /** waitStatus value to indicate successor's thread needs unparking */
        /** 等待节点的后继节点对应的线程需要阻塞 */
        static final int SIGNAL    = -1;
        /** waitStatus value to indicate thread is waiting on condition */
        /** 等待节点对应的线程在条件队列等待中 */
        static final int CONDITION = -2;
        /**
         * waitStatus value to indicate the next acquireShared should
         * unconditionally propagate
         */
        static final int PROPAGATE = -3;

        /**
         * Status field, taking on only the values:
         *   SIGNAL:     The successor of this node is (or will soon be)
         *               blocked (via park), so the current node must
         *               unpark its successor when it releases or
         *               cancels. To avoid races, acquire methods must
         *               first indicate they need a signal,
         *               then retry the atomic acquire, and then,
         *               on failure, block.
         *   CANCELLED:  This node is cancelled due to timeout or interrupt.
         *               Nodes never leave this state. In particular,
         *               a thread with cancelled node never again blocks.
         *   CONDITION:  This node is currently on a condition queue.
         *               It will not be used as a sync queue node
         *               until transferred, at which time the status
         *               will be set to 0. (Use of this value here has
         *               nothing to do with the other uses of the
         *               field, but simplifies mechanics.)
         *   PROPAGATE:  A releaseShared should be propagated to other
         *               nodes. This is set (for head node only) in
         *               doReleaseShared to ensure propagation
         *               continues, even if other operations have
         *               since intervened.
         *   0:          None of the above
         *
         * The values are arranged numerically to simplify use.
         * Non-negative values mean that a node doesn't need to
         * signal. So, most code doesn't need to check for particular
         * values, just for sign.
         *
         * The field is initialized to 0 for normal sync nodes, and
         * CONDITION for condition nodes.  It is modified using CAS
         * (or when possible, unconditional volatile writes).
         */
        /**
         * 1.CANCELLED，值为1，表示当前的线程被取消；
         * 2.SIGNAL，值为-1，表示当前节点的后继节点包含的线程需要运行，也就是unpark；
         * 3.CONDITION，值为-2，表示当前节点在等待condition，也就是在condition队列中；
         * 4.PROPAGATE，值为-3，表示当前场景下后续的acquireShared能够得以执行；
         * 5.值为0，表示当前节点在sync队列中，等待着获取锁。
         */
        volatile int waitStatus;

        /**
         * Link to predecessor node that current node/thread relies on
         * for checking waitStatus. Assigned during enqueuing, and nulled
         * out (for sake of GC) only upon dequeuing.  Also, upon
         * cancellation of a predecessor, we short-circuit while
         * finding a non-cancelled one, which will always exist
         * because the head node is never cancelled: A node becomes
         * head only as a result of successful acquire. A
         * cancelled thread never succeeds in acquiring, and a thread only
         * cancels itself, not any other node.
         */
        // 前驱节点
        volatile Node prev;

        /**
         * Link to the successor node that the current node/thread
         * unparks upon release. Assigned during enqueuing, adjusted
         * when bypassing cancelled predecessors, and nulled out (for
         * sake of GC) when dequeued.  The enq operation does not
         * assign next field of a predecessor until after attachment,
         * so seeing a null next field does not necessarily mean that
         * node is at end of queue. However, if a next field appears
         * to be null, we can scan prev's from the tail to
         * double-check.  The next field of cancelled nodes is set to
         * point to the node itself instead of null, to make life
         * easier for isOnSyncQueue.
         */
        // 后继节点
        volatile Node next;

        /**
         * The thread that enqueued this node.  Initialized on
         * construction and nulled out after use.
         */
        // 存储的线程引用
        volatile Thread thread;

        /**
         * Link to next node waiting on condition, or the special
         * value SHARED.  Because condition queues are accessed only
         * when holding in exclusive mode, we just need a simple
         * linked queue to hold nodes while they are waiting on
         * conditions. They are then transferred to the queue to
         * re-acquire. And because conditions can only be exclusive,
         * we save a field by using special value to indicate shared
         * mode.
         */
        // 当前节点在Condition中等待队列上的下一个节点（给Condition等待队列使用）
        Node nextWaiter;

        /**
         * Returns true if node is waiting in shared mode.
         */
        final boolean isShared() {
            return nextWaiter == SHARED;
        }

        /**
         * Returns previous node, or throws NullPointerException if null.
         * Use when predecessor cannot be null.  The null check could
         * be elided, but is present to help the VM.
         *
         * @return the predecessor of this node
         */
        final Node predecessor() throws NullPointerException {
            Node p = prev;
            if (p == null)
                throw new NullPointerException();
            else
                return p;
        }

        Node() {    // Used to establish initial head or SHARED marker
        }

        Node(Thread thread, Node mode) {     // Used by addWaiter
            this.nextWaiter = mode;
            this.thread = thread;
        }

        Node(Thread thread, int waitStatus) { // Used by Condition
            this.waitStatus = waitStatus;
            this.thread = thread;
        }
    }

```

### ConditionObject

[源码分析](/concurrent/ConditionObject.md)

## 方法

### acquire

获取独占锁的入口途径之一

```java

    /**
     * Acquires in exclusive mode, ignoring interrupts.  Implemented
     * by invoking at least once {@link #tryAcquire},
     * returning on success.  Otherwise the thread is queued, possibly
     * repeatedly blocking and unblocking, invoking {@link
     * #tryAcquire} until success.  This method can be used
     * to implement method {@link Lock#lock}.
     *
     * @param arg the acquire argument.  This value is conveyed to
     *        {@link #tryAcquire} but is otherwise uninterpreted and
     *        can represent anything you like.
     */
    @ReservedStackAccess
    public final void acquire(int arg) {
        /**
         * 1.tryAcquire尝试获取锁。此方法由子类提供具体实现逻辑
         * 2.如果tryAcquire获取锁失败，定义Node为独占模式，加入等待队列
         * 3.由于&&短路的特性，在获取锁的过程中，返回的中断标志为true，会再次让线程自我中断一次
         */
        if (!tryAcquire(arg) &&
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }

```

### acquireInterruptibly

获取锁时响应中断

```java

    public final void acquireInterruptibly(int arg)
            throws InterruptedException {
        // 判断当前线程是否中断（清除中断标记）
        if (Thread.interrupted())
            throw new InterruptedException();
        if (!tryAcquire(arg))
            doAcquireInterruptibly(arg);
    }

```

### release

独占锁释放锁资源

```java
    public final boolean release(int arg) {
        // tryRelease由子类实现
        if (tryRelease(arg)) {
            // 获取头节点
            Node h = head;
            // 如果头结点不为空，并且头节点的状态不为0，0代表的是新建节点状态，那么代表该节点的后继节点需要唤醒
            if (h != null && h.waitStatus != 0)
                // 唤醒后继节点
                unparkSuccessor(h);
            return true;
        }
        return false;
    }
```

### acquireShared

获取共享锁

```java
    public final void acquireShared(int arg) {
        // tryAcquireShared 返回-1获取锁失败，返回值大于1或者0获取锁成功
        if (tryAcquireShared(arg) < 0)
            // 获取锁失败，进入队列操作
            doAcquireShared(arg);
    }
```

### doAcquireShared

获取共享锁失败，进入队列操作（非响应中断）

```java
    private void doAcquireShared(int arg) {
        /**
         * 1.新建共享模式的Node对象
         * 2.入队列
         */
        final Node node = addWaiter(Node.SHARED);
        // 入队列失败标志
        boolean failed = true;
        try {
            // 线程是否被中断标志
            boolean interrupted = false;
            // 死循环
            for (;;) {
                // 获取前驱节点
                final Node p = node.predecessor();
                // 如果前继节点是head，则尝试获取锁。因为头节点可能处于正在获取锁，或者已经获取到锁了，那么该节点可以尝试去获取锁
                if (p == head) {
                    int r = tryAcquireShared(arg);
                    if (r >= 0) {
                        // 获取锁成功，设置新head和共享传播（唤醒下一个共享节点）
                        setHeadAndPropagate(node, r);
                        p.next = null; // help GC
                        if (interrupted)
                            selfInterrupt();
                        failed = false;
                        return;
                    }
                }
                // 如果获取锁失败，那么我们是否考虑阻塞该节点，非响应中断
                if (shouldParkAfterFailedAcquire(p, node) &&
                    parkAndCheckInterrupt())
                    interrupted = true;
            }
        } finally {
            if (failed)
                cancelAcquire(node);
        }
    }
```

### setHeadAndPropagate

入参 node 所代表的线程一定是当前执行的线程，propagate 则代表 tryAcquireShared 的返回值，
由于有 if (r >= 0)的保证，propagate 必定为>=0，这里返回值的意思是：如果>0，说明我这次获取共享锁成功后，
还有剩余共享锁可以获取；如果=0，说明我这次获取共享锁成功后，没有剩余共享锁可以获取

```java

    private void setHeadAndPropagate(Node node, int propagate) {
        // 记录旧的头节点
        Node h = head; // Record old head for check below
        // 因为该节点已经获取到了锁，那么在setHead中可以将线程的引用取消掉
        setHead(node);
        /*
         * Try to signal next queued node if:
         *   Propagation was indicated by caller,
         *     or was recorded (as h.waitStatus either before
         *     or after setHead) by a previous operation
         *     (note: this uses sign-check of waitStatus because
         *      PROPAGATE status may transition to SIGNAL.)
         * and
         *   The next node is waiting in shared mode,
         *     or we don't know, because it appears null
         *
         * The conservatism in both of these checks may cause
         * unnecessary wake-ups, but only when there are multiple
         * racing acquires/releases, so most need signals now or soon
         * anyway.
         */
        /**
         * 1.propagate > 0说明还有资源可以获取，当然需要唤醒后面的线程
         * 2.h.waitStatus < 0 代表旧的头节点后面的节点可以被唤醒
         * 3.(h = head) == null || h.waitStatus < 0 这个操作是说新的头节点后面的节点可以被唤醒
         * （前面迷惑性h==null,是标准判空写法，防止异常）
         */
        if (propagate > 0 || h == null || h.waitStatus < 0 ||
            (h = head) == null || h.waitStatus < 0) {
            Node s = node.next;
            // s==null 判空写法，如果后续节点是共享模式节点，尝试唤醒节点
            if (s == null || s.isShared())
                    doReleaseShared();
        }
    }

```

### releaseShared

```java
    public final boolean releaseShared(int arg) {
        if (tryReleaseShared(arg)) {
            doReleaseShared();
            return true;
        }
        return false;
    }
```

### doReleaseShared

共享锁释放资源

```java
    private void doReleaseShared() {
        /*
         * Ensure that a release propagates, even if there are other
         * in-progress acquires/releases.  This proceeds in the usual
         * way of trying to unparkSuccessor of head if it needs
         * signal. But if it does not, status is set to PROPAGATE to
         * ensure that upon release, propagation continues.
         * Additionally, we must loop in case a new node is added
         * while we are doing this. Also, unlike other uses of
         * unparkSuccessor, we need to know if CAS to reset status
         * fails, if so rechecking.
         */
        // 死循环
        for (;;) {
            // 获取CLH队列头节点
            Node h = head;
            if (h != null && h != tail) {
                int ws = h.waitStatus;
                // 判断头节点的waitStatus是否为SIGNAL，
                // 如果为SIGNAL，该值必为其后继节点设置的，说明后继节点等待被唤醒
                if (ws == Node.SIGNAL) {
                    // CAS 将头节点的waitStatus由SIGNAL设置为0, 相当于重置
                    // 这个进行CAS主要是考虑release时也会调用该方法，需要并发控制
                    if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                        continue;            // loop to recheck cases
                    // 唤醒后继节点
                    unparkSuccessor(h);
                }
                /**
                 * 如果不为SIGNAL，接着会进行判断当前头节点的waitStatus是否为0，如果不为0，进行执行for循环；
                 * 如果为0，代表已经当前头节点的后继节点已经被唤醒，那么就将头节点的waitStatus设置为PROPAGATE，代表在下次acquireShared时无条件地传播
                 */
                else if (ws == 0 &&
                         !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                    continue;                // loop on failed CAS
            }
            if (h == head)                   // loop if head changed
                break;
        }
    }
```

### doAcquireInterruptibly

相应中断式的，获取锁资源

```java

    private void doAcquireInterruptibly(int arg)
        throws InterruptedException {
        // 独占模式节点
        final Node node = addWaiter(Node.EXCLUSIVE);
        // 失败标志
        boolean failed = true;
        try {
            // 死循环
            for (;;) {
                // 这里的代码跟非中断式的代码一样
                final Node p = node.predecessor();
                if (p == head && tryAcquire(arg)) {
                    setHead(node);
                    p.next = null; // help GC
                    failed = false;
                    return;
                }
                // 唯一的区别就是，如果标志中断返回true了，那么抛出线程中断异常
                if (shouldParkAfterFailedAcquire(p, node) &&
                    parkAndCheckInterrupt())
                    throw new InterruptedException();
            }
        } finally {
            // 在抛出的情况下，failed才是true
            if (failed)
                // 取消节点排队
                cancelAcquire(node);
        }
    }

```

### hasQueuedPredecessors

判断同步队列是否有其他线程正在排队，此方法在公平锁的实现中所用到

```java

    public final boolean hasQueuedPredecessors() {
        // The correctness of this depends on head being initialized
        // before tail and on head.next being accurate if the current
        // thread is first in queue.
        // 获取尾节点
        Node t = tail; // Read fields in reverse initialization order
        // 获取头节点
        Node h = head;
        Node s;
        /**
         * 1. 如果 h==t 说明当前线程前面没有节点 直接返回false
         * 2. h!=t 代表了队列必有2个以上的元素，可能是 一个new Node(),和
         * 3. 如果而(s= h.next)==null为true，有其他线程第一次正在入队时，可能会出现。见AQS的enq方法，compareAndSetHead(node)完成，
         *    还没执行tail=head语句时，此时tail=null,head=newNode,head.next=null。这种情况肯定是有线程进入了队列等待所以返回true
         * 4. (s = h.next) == null为false，head节点可能占用着锁（除了第一次执行enq()入队列时，head仅仅是个new Node()，没有实际对应任何线程，
         *    但是却“隐式”对应第一个获得锁但并未入队列的线程，和后续的head在含义上保持一致），也可能释放了锁（unlock()）,未被阻塞的head.next节点对应的线程在任意时刻都是有必要去尝试获取锁
         */
        return h != t &&
            ((s = h.next) == null || s.thread != Thread.currentThread());
    }
```

### addWaiter

加入等待节点

```java

    private Node addWaiter(Node mode) {
        // 根据当前线程，模式初始化一个Node节点
        Node node = new Node(Thread.currentThread(), mode);
        // Try the fast path of enq; backup to full enq on failure
        // 快速尝试一次从队列尾部插入节点
        Node pred = tail;
        if (pred != null) {
            node.prev = pred;
            if (compareAndSetTail(pred, node)) {
                pred.next = node;
                return node;
            }
        }
        // 如果tail为空或者cas加入队尾失败，调用enq将节点添加到AQS队列
        enq(node);
        return node;
    }
```

### enq

死循环入队列

```java

    private Node enq(final Node node) {
        // 死循环
        for (;;) {
            Node t = tail;
            // 如果tail为空，那么代表队列是空的，必须初始化
            if (t == null) { // Must initialize
                // CAS设置头节点为一个New Node（隐式代表着获取锁，没入队列的线程）
                if (compareAndSetHead(new Node()))
                    // CAS设置头部之后，将尾部也设置成New Node
                    tail = head;
            } else {
                // 走到这里队尾肯定不是空的，跟快速入队尾的操作一致，只不过是失败会无限循环直到能入队列为止
                node.prev = t;
                if (compareAndSetTail(t, node)) {
                    t.next = node;
                    return t;
                }
            }
        }
    }
```

### acquireQueued

已经在队列中的 node 尝试去获取锁否则挂起

```java

    final boolean acquireQueued(final Node node, int arg) {
        boolean failed = true;
        try {
            // 线程是否中断标志
            boolean interrupted = false;
            for (;;) {
                // 获取节点的前驱节点
                final Node p = node.predecessor();
                /**
                 * 如果前驱节点是头结点，表示它的前驱的节点就是正在运行的线程，自己才是真正在排队的节点
                 * 那么再去tryAcquire尝试获取锁，如果获取成功，说明此时前置线程已经运行结束，则将head设置为当前节点返回
                 */
                if (p == head && tryAcquire(arg)) {
                    setHead(node);
                    // 将前置节点移出队列，这样就没有指针指向它，可以被gc回收
                    p.next = null; // help GC
                    failed = false;
                    //返回false表示不能被打断，意思是没有被挂起，也就是获得到了锁
                    return interrupted;
                }
                /**
                 * shouldParkAfterFailedAcquire将前置node设置为需要被挂起
                 * shouldParkAfterFailedAcquire返回true才回因为 && 短路特效去尝试停泊线程
                 * shouldParkAfterFailedAcquire返回false，会继续在死循环中尝试获取锁
                 * parkAndCheckInterrupt会阻塞线程了，当该线程被唤醒会返回是否被中断过，如果被中断过我们通过interrupted记录下
                 */
                if (shouldParkAfterFailedAcquire(p, node) &&
                    parkAndCheckInterrupt())
                    interrupted = true;
            }
        } finally {
            /**
             * 而从前面的分析中我们知道，要从for(;;)中跳出来，只有一种可能，那就是当前线程已经拿到了锁，因为整个争锁过程我们都是不响应中断的，
             * 所以不可能有异常抛出，既然是拿到了锁，failed就一定是true，所以这个finally块在这里实际上并没有什么用，它是为响应中断式的抢锁所服务的
             */
            if (failed)
                cancelAcquire(node);
        }
    }

```

### shouldParkAfterFailedAcquire

SIGNAL 这个状态就有点意思了，它不是表征当前节点的状态，而是当前节点的下一个节点的状态。
当一个节点的 waitStatus 被置为 SIGNAL，就说明它的下一个节点（即它的后继节点）已经被挂起了（或者马上就要被挂起了），
因此在当前节点释放了锁或者放弃获取锁时，如果它的 waitStatus 属性为 SIGNAL，它还要完成一个额外的操作——唤醒它的后继节点。

```java

    private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
        // 拿到前驱节点的状态
        int ws = pred.waitStatus;
        // 如果已经告诉前驱节点拿到锁后通知自己一下，那就可以安心休息了
        if (ws == Node.SIGNAL)
            /*
             * This node has already set status asking a release
             * to signal it, so it can safely park.
             */
            return true;
        // 如果前驱节点放弃等待，那就一直往前找，直到找到最近一个正常等待的状态，并排在它的后边
        if (ws > 0) {
            /*
             * Predecessor was cancelled. Skip over predecessors and
             * indicate retry.
             */
            do {
                node.prev = pred = pred.prev;
            } while (pred.waitStatus > 0);
            // 直到找到还在一直等待的节点，与node进行关联，中间部分的节点(可达性分析)没有引用了会被GC
            pred.next = node;
        } else {
            /*
             * waitStatus must be 0 or PROPAGATE.  Indicate that we
             * need a signal, but don't park yet.  Caller will need to
             * retry to make sure it cannot acquire before parking.
             */

            /**
             * 前驱节点的状态既不是SIGNAL，也不是CANCELLED
             * 用CAS设置前驱节点的ws为 Node.SIGNAL，它会在释放锁时唤醒自己
             */
            compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
        }
        return false;
    }
```

### parkAndCheckInterrupt

我们从 LockSupport.park(this)处被唤醒，我们并不知道是因为什么原因被唤醒，可能是因为别的线程释放了锁，
调用了 LockSupport.unpark(s.thread)，也有可能是因为当前线程在等待中被中断了，因此我们通过 Thread.interrupted()方法检查了当前线程的中断标志，
并将它记录下来，在我们最后返回 acquireQueued 方法后，如果发现当前线程曾经被中断过，那我们就把当前线程再中断一次。

```java
     private final boolean parkAndCheckInterrupt() {
        // 通过LockSupport.park停止当前线程，那么当前线程就停在此处了，让出CPU时间
        LockSupport.park(this);
        return Thread.interrupted();
    }
```

### cancelAcquire

```java
    private void cancelAcquire(Node node) {
        // Ignore if node doesn't exist
        // 如果node为空直接退出
        if (node == null)
            return;
        // node不再关联到任何线程
        node.thread = null;

        // Skip cancelled predecessors
        // 跳过被cancel的前继node，找到一个有效的前继节点pred
        Node pred = node.prev;
        while (pred.waitStatus > 0)
            node.prev = pred = pred.prev;

        // predNext is the apparent node to unsplice. CASes below will
        // fail if not, in which case, we lost race vs another cancel
        // or signal, so no further action is necessary.
        // 获取过滤后的前继节点的后继节点
        Node predNext = pred.next;

        // Can use unconditional write instead of CAS here.
        // After this atomic step, other Nodes can skip past us.
        // Before, we are free of interference from other threads.
        // 将node的waitStatus置为CANCELLED
        node.waitStatus = Node.CANCELLED;

        // If we are the tail, remove ourselves.
        // 如果node是尾节点，直接将pred设置为尾节点，pred是我们能找到最近一个有效节点
        if (node == tail && compareAndSetTail(node, pred)) {
            // CAS设置pred节点的next为null(所以前面我们会获取一次正常状态pred的后继节点)，pred节点后续的节点都是CANCELLED的
            compareAndSetNext(pred, predNext, null);
        } else {
            // If successor needs signal, try to set pred's next-link
            // so it will get one. Otherwise wake it up to propagate.
            int ws;
            // 如果当前节点的前驱节点不是头节点 同时 前驱节点的等待状态为SIGNAL(如果不是SIGNAL那就设置为SIGNAL) 且 前驱节点封装的线程不为NULL
            // pred的前驱节点无法CAS设置为SIGNAL状态 或者 前驱节点线程为null，可能刚好被取消了，所以都应该跳转到else分支：唤醒node的后继节店让它来去删除node
            if (pred != head &&
                ((ws = pred.waitStatus) == Node.SIGNAL ||
                 (ws <= 0 && compareAndSetWaitStatus(pred, ws, Node.SIGNAL))) &&
                pred.thread != null) {
                // 获取节点的后继节点
                Node next = node.next;
                // 如果后继节点的等待状态不为CANCELLED，则通过CAS将前驱节点的后继指针指向当前节点的后继节点
                if (next != null && next.waitStatus <= 0)
                    compareAndSetNext(pred, predNext, next);
            } else {
                // 如果当前节点的前驱节点是头节点，则直接唤醒当前节点的后继节点，让它来剔除当前节点
                unparkSuccessor(node);
            }
            // gc回收node
            node.next = node; // help GC
        }
    }
```

### unparkSuccessor

唤醒当前节点的后继节点

```java

    private void unparkSuccessor(Node node) {
        /*
         * If status is negative (i.e., possibly needing signal) try
         * to clear in anticipation of signalling.  It is OK if this
         * fails or if status is changed by waiting thread.
         */
        // 获取节点的=waitStatus
        int ws = node.waitStatus;
        /**
         * 1.这里需要判断节点状态是否为取消
         * 2.如果不是取消状态，那么该节点应该可能正在获取锁资源所以我们要把该节点的状态通过CAS设置成0
         */
        if (ws < 0)
            compareAndSetWaitStatus(node, ws, 0);

        /*
         * Thread to unpark is held in successor, which is normally
         * just the next node.  But if cancelled or apparently null,
         * traverse backwards from tail to find the actual
         * non-cancelled successor.
         */
        // 获取节点的后继节点
        Node s = node.next;
        // 如果后继节点是空 或者 后继节点被取消了
        if (s == null || s.waitStatus > 0) {
            // 将后继节点置空
            s = null;
            // 从尾部开始寻找一个有效节点
            for (Node t = tail; t != null && t != node; t = t.prev)
                if (t.waitStatus <= 0)
                    s = t;
        }
        // 节点不为空就将其唤醒
        if (s != null)
            LockSupport.unpark(s.thread);
    }

```

### hasQueuedPredecessors（共享锁里使用）

主要是用来判断线程需不需要排队，因为队列是 FIFO 的，所以需要判断队列中有没有相关线程的节点已经在排队了。有则返回 true 表示线程需要排队，没有则返回 false 则表示线程无需排队

```java
    public final boolean hasQueuedPredecessors() {
        // The correctness of this depends on head being initialized
        // before tail and on head.next being accurate if the current
        // thread is first in queue.
        // 读取头尾节点
        Node t = tail; // Read fields in reverse initialization order
        Node h = head;
        Node s;
        /**
         * 1.h!=t代表队列至少有2节点，因为只有入队了一个节点，tail就会被head赋值，
         * 2.(s=h.next)==null 为false表示头节点有后继节点，s.thread != Thread.currentThread()返回fasle表示着当前线程和后继节点的线程是相同的，那就说明已经轮到这个线程相关的节点去尝试获取同步状态了，自然无需排队，直接返回fasle
         * 3.如果 (s=h.next)==null为true表示头节点后面没有节点自然也不需要排队了
         */
        return h != t &&
            ((s = h.next) == null || s.thread != Thread.currentThread());
    }
```
