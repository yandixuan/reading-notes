# ConcurrentHashMap

[文章参考](https://blog.csdn.net/weixin_30342639/article/details/107420546)

Java 7 为实现并行访问，引入了 Segment 这一结构，实现了分段锁，理论上最大并发度与 Segment 个数相等。

Java 8 放弃了一个 HashMap 被一个 Segment 封装加上锁的复杂设计，取而代之的是在 HashMap 的每个 Node 上增加 CAS + Synchronized 来保证并发安全进行实现。

同时为了提高哈希碰撞下的寻址性能，Java 8 在链表长度超过一定阈值（8）时将链表（寻址时间复杂度为 O(N)）转换为 红黑树（寻址时间复杂度为 O(log(N))）

那么我肯定是基于 java8 进行源码学习

:::tip 提示
在 HashMap 中是允许 key 和 value 为 null 的，而在 ConcurrentHashMap 中则是不允许的会直接抛出空指针异常。
在 HashMap 根据 key 获取的值是 null，而我们根本分不清楚到底这个 key 是不存在导致 get 为 null 还是存在还是值为 null，确实但是 hashMap 中我们可以
通过 containsKey 来判断属于哪一种情况，而在多线程的环境中，null 存在二义性允许，索性 Doug Lea 设定好代码规范 key，value 都不能为 null
:::

```java
    public class ConcurrentHashMap<K,V> extends AbstractMap<K,V>
    implements ConcurrentMap<K,V>, Serializable {
        private static final long serialVersionUID = 7249069246763182397L;

    ...省略
    }
```

## 属性

```java






```

## 构造方法

```java

    /**
    * 无参构造器
    * 空实现，所有参数都是走默认的
    */
    public ConcurrentHashMap() {

    }

    /**
    * 根据 initialCapacity参数
    */
    public ConcurrentHashMap(int initialCapacity) {
        // initialCapacity非负校验
        if (initialCapacity < 0)
            throw new IllegalArgumentException();
        // 与HashMap不同的是，这里initialCapacity如果大于等于2的29次方的时候（HashMap这里为超过2的30次方），
        // 就重置为2的30次方
        // tableSizeFor方法是用来求出大于等于指定值的最小2次幂的
        // 在HashMap中仅仅就是对设定的数组容量取最小2次幂，而这里首先对设定值*1.5+1后进行取最小的2次幂
        int cap = ((initialCapacity >= (MAXIMUM_CAPACITY >>> 1)) ?
                   MAXIMUM_CAPACITY :
                   tableSizeFor(initialCapacity + (initialCapacity >>> 1) + 1));
        // sizeCtl是用来记录当前数组的状态的（类似于HashMap中的threshold）

        this.sizeCtl = cap;
    }

    public ConcurrentHashMap(Map<? extends K, ? extends V> m) {
        this.sizeCtl = DEFAULT_CAPACITY;
        putAll(m);
    }

    public ConcurrentHashMap(int initialCapacity, float loadFactor) {
        this(initialCapacity, loadFactor, 1);
    }

    public ConcurrentHashMap(int initialCapacity,
                             float loadFactor, int concurrencyLevel) {
        if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
            throw new IllegalArgumentException();
        if (initialCapacity < concurrencyLevel)   // Use at least as many bins
            initialCapacity = concurrencyLevel;   // as estimated threads
        long size = (long)(1.0 + (long)initialCapacity / loadFactor);
        int cap = (size >= (long)MAXIMUM_CAPACITY) ?
            MAXIMUM_CAPACITY : tableSizeFor((int)size);
        this.sizeCtl = cap;
    }


```

## 方法
